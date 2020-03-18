const fetch = require('node-fetch');
const fs = require('fs');
const axios = require('axios').default;

const download_image = (url, image_path, auth) =>
  axios({
    url,
    responseType: 'stream',
    headers: {'Authorization': auth},
  }).then(
    response =>
      new Promise((resolve, reject) => {
        response.data
          .pipe(fs.createWriteStream(image_path))
          .on('finish', () => resolve())
          .on('error', e => reject(e));
      }),
  );



exports.sourceNodes = async (
  { actions, ...createNodeHelperFunctions },
  pluginOptions
) => {
  const { createNode } = actions

  // Get data from Confluence
  const response = await search(pluginOptions)

  const { hostname, auth } = pluginOptions;

  const baseUrl = response._links.base
  const results = response.results.filter(result => result.type === 'page')

  // Parse into nodes and add to GraphQL schema
  const nodes = results.map(pageResult => formatPageNode(createNodeHelperFunctions, pageResult, baseUrl, hostname, auth)
  )

  nodes.forEach(node => {
    // Create node
    createNode(node)
  })
}

const search = async ({ hostname, auth, cql, limit = 10 }) => {
  return await fetch(
    `https://${hostname}/wiki/rest/api/content/search/?cql=(${cql})&expand=body.view,history,ancestors&limit=${limit}`,
    {
      headers: {
        Authorization: auth,
        Accept: 'application/json',
      },
    }
  )
    .then(x => x.json())
    .catch(e => {
      console.error('Unable to retrieve data from Confluence:', e)
      process.exit(1)
    })
}

const formatPageNode = (
  { createNodeId, createContentDigest },
  result,
  baseUrl,
  hostname, 
  auth
) => {
  const slug = slugify(result.title);
  const re = /<img[^>]+src="?([^"\s]+)"?[^>]*>/g;
  const results = re.exec(result.body.view.value);
  var img;
  if(results) {
      img = results[1];
      download_image(img, `static/${slug}.png`, auth);
  }

  console.log('NODE IMG: ', img);

  content = {
    confluenceId: result.id,
    title: result.title,
    slug,
    confluenceUrl: `${baseUrl}${result._links.webui}`,
    createdDate: new Date(result.history.createdDate),
    author: {
      name: result.history.createdBy.displayName,
      email: result.history.createdBy.email,
      profilePicture: `https://${hostname}${result.history.createdBy.profilePicture.path}`
    },
    imageHeader: img,
    bodyHtml: result.body.view.value,
    ancestorIds: result.ancestors.map(x => x.id),
  }

  const nodeId = createNodeId(`confluence-page-${content.confluenceId}`)
  const nodeContent = JSON.stringify(content)

  const nodeData = Object.assign({}, content, {
    id: nodeId,
    parent: null,
    children: [],
    internal: {
      type: `ConfluencePage`,
      content: nodeContent,
      contentDigest: createContentDigest(nodeContent),
    },
  })

  return nodeData
}

// From: https://medium.com/@mhagemann/the-ultimate-way-to-slugify-a-url-string-in-javascript-b8e4a0d849e1
const slugify = string => {
  const a = 'àáäâãåăæçèéëêǵḧìíïîḿńǹñòóöôœṕŕßśșțùúüûǘẃẍÿź·/_,:;'
  const b = 'aaaaaaaaceeeeghiiiimnnnoooooprssstuuuuuwxyz------'
  const p = new RegExp(a.split('').join('|'), 'g')
  return string
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
    .replace(/&/g, '-and-') // Replace & with ‘and’
    .replace(/[^\w\-]+/g, '') // Remove all non-word characters
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, '') // Trim - from end of text
}

const debug = require('debug')('dweb-transports:naming');

/*
 * Mapping from archive.org URLs to dweb
 *
 * Note this table looks messy because cors handling at the archive is messy,
 * and also because dweb.me aka dweb.archive.orgs python gateway is being transitioned out.
 * TODO-DM242 should handle archive.org/download/IDENTIFIER/IDENTIFIER_archive.torrent -> www-dweb-torrent.dev.archive.org
 */
const archiveOrg = {
  ".": [ "https://www-dweb-cors.dev.archive.org/" ],  // Handles at least "/about and /bookreader /embed" catch al to go thru cors to archive.org

  // see https://github.com/internetarchive/dweb-mirror/issues/288 re cors issues fails on e.g. http://localhost:4244/details?query=bananas&mirror=&transport=HTTP
  "advancedsearch": ["https://www-dweb-cors.dev.archive.org/advancedsearch.php"],  // Works
  "advancedsearch.php": ["https://www-dweb-cors.dev.archive.org/advancedsearch.php"],  // Works
  //"advancedsearch": ["https://dweb.archive.org/advancedsearch"],  // Works but dependent on dweb.me
  //"advancedsearch": ["https://cors.archive.org/advancedsearch.php"],  // Fails

  "contenthash": ["https://dweb.archive.org/contenthash/"],  // TODO Legacy, if need to support should move to static microservice

  // This group are essentially the same thing
  "download": [ "https://archive.org/cors/" ], // Does not support HEAD but efficient since hits web nodes
  //"download": [ "https://www-dweb-cors.dev.archive.org/download" ], // Works but direct /cors/ is quicker
  "serve": ["https://archive.org/cors/"], // Treat same as 'download'

  "examples": ["https://dweb.archive.org/archive/examples/"], // Only used for demos

  // CORS issues requested in slack with Tracey 2019-nov-27
  "images": ["https://www-dweb-cors.dev.archive.org/images/"],
  //"images": ["https://cors.archive.org/images/"], // Fails

  "archive": ["https://www-dweb-cors.deb.archive.org/"], // Legacy

  "services": {
    "img": [ "https://archive.org/services/img/"]   // Main URL does cors
  },
  "thumbnail": [ "https://archive.org/services/img/" ], // Deprecated way to get thumbnails when it looked like there might be a different way

  "metadata": [
    "wolk://dweb.archive.org/metadata/",  // TODO-TORRENT move wolk hijacker to use dweb-metadata
    "gun:/gun/arc/archive.org/metadata/", // TODO-TORRENT move gunDB hijacker to use dweb-metadata
    "https://www-dweb-metadata.dev.archive.org/metadata/"], // Appends magnet link

  "mds": [ 'https://be-api.us.archive.org/mds/' ], // Currently only '/mds/v1/get_related/all/IDENTIFIER'

  //Redirects to archive.html from standard archive.org urls
  "details": ["https://www-dweb.dev.archive.org/archive/archive.html?item="], // TODO possibly move to static files microservice
  "search.php": ["https://www-dweb.dev.archive.org/archive/archive.html?query="],
  "search": ["https://www-dweb.dev.archive.org/archive/archive.html?query="]
}
// List of URLS mirrored by dweb-mirror
// Any resolution above that starts with one of these will be replaced by 'mirror' if its passed as a config to Transports
const archiveOrgMirroredUrls = [
  "https://archive.org",
  "https://dweb.archive.org",
  "https://www-dweb-metadata.dev.archive.org",
  "https://www-dweb.dev.archive.org",
  "https://be-api.us.archive.org"
]


const domains = {
  'dweb:/': {
    arc: {"archive.org": archiveOrg},
    ipfs: ["http://ipfs.io/ipfs/", "https://dweb.me/ipfs/"], //TODO maybe need way to say check ipfs: as well ?
  },
  "https://archive.org/": archiveOrg,
  "http://archive.org/": archiveOrg,
  "https://dweb.archive.org/": archiveOrg,
  "https://be-api.us.archive.org/": archiveOrg  // Just /mds/v1/related/all/IDENTIFIER
};

function _toUrl(partialUrl, remainder, query) {
  const p = partialUrl + remainder.join('/')
  return query
    ? [p,query].join(p.includes('?') ? '&' : '?')
    : p;
}

/**
 * Recursive worker
 * @param parent string
 * @param domain object { key: [urlFrag] or key: urlFrag}
 * @param pathArr array
 * @returns [URL]
 * @private
 */
function _recursive(parent, table, pathArr) {
  const name = pathArr.shift();
  let found = table[name];
  if (!found) {
    pathArr.unshift(name); // Didn't use it - pass to return or "."
  }
  if (!found && table["."]) {
    found = table["."]; // Maybe undefined
  }
  if (!found) {
    debug("WARNING unable to resolve %s in %s", name, parent )
  }
  return ((typeof found === "object") && !Array.isArray(found))
    ? _recursive(parent + name + "/", found, pathArr)
    : [ found, pathArr ];
}

/**
 * Resolve path in a domain object
 * @param parent
 * @param domain
 * @param pathAndQuery
 * @returns [url]
 */
function resolveNameInDomain(parent, domain, pathAndQuery) {
  const [path, query] = pathAndQuery.split('?');
  const [foundStrOrArr, remainder] = _recursive(parent, domain, path.split('/')); // recursive
  return Array.isArray(foundStrOrArr)
    ? foundStrOrArr.map(partialUrl => _toUrl(partialUrl, remainder, query))
      .filter(url =>  !!url)
    : [ _toUrl(foundStrOrArr, remainder, query) ];
}

/**
 * Resold a URL into a URL or Array of URLs to pass to DwebTransports.Transports methods
 * @param url
 * @returns [url] or url
 */
function resolveName(url) {
  // Find a domain object to resolve in
  const dom = Object.keys(domains).find( d => url.startsWith(d));
  return dom
    ? resolveNameInDomain(dom, domains[dom], url.slice(dom.length))
    : url;
}

/**
 * Resolve an array of urls or names into another array of urls or names
 *
 * @param names
 * @returns [url]
 */
function naming(names) {
    return [].concat(...names.map(n => resolveName(n)))
}

/**
 * Asynchronous version of naming
 * @param names
 * @returns {Promise<[url]>}
 */
async function p_namingcb(names) {
  return new Promise((resolve, reject) => { try { const res = naming(names); resolve(res); } catch(err) {reject(err)}}); // Promisify pattern v2b (no CB)
}

/*
const testdata = {
  "dweb:/arc/archive.org/metadata/foo": [
    "https://www-dweb-metadata.dev.archive.org/metadata/foo",
    "gun:/gun/arc/archive.org/metadata/foo",
    "wolk://dweb.archive.org/metadata/foo" ],
  "dweb:/arc/archive.org/details/foo": [
    "https://dweb.archive.org/archive/archive.html?item=foo"],
  "https://archive.org/metadata/bar": [
    'wolk://dweb.archive.org/metadata/bar',
    'gun:/gun/arc/archive.org/metadata/bar',
    'https://www-dweb-metadata.dev.archive.org/metadata/bar'
  ],
  "https://archive.org/something/else": [
    'https://archive.org/something/else'
  ],
  "https://archive.org/advancedsearch?query=splat": [
    'https://dweb.archive.org/advancedsearch?query=splat'
  ]
}

function test() {
  Object.entries(testdata).forEach(kv => {
    const res = resolveName(kv[0]);
    if ((!res
      || res.length !== kv[1].length)
      || res.some(r => !kv[1].includes(r))) {
    debug("%s => %s expect %s", kv[0], res, kv[1]);
  }});
  p_namingcb(["dweb:/arc/archive.org/details/foo","foo://bar.baz"])
  .then(res => debug("Got %o", res))
  .catch(err => debug("Fail %o", err.message));
}
test();
*/

exports = module.exports = {naming, p_namingcb, archiveOrgMirroredUrls};

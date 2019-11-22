const debug = require('debug')('dweb-transports:naming');

const archiveOrg = { // Mapping from archive.org URLs to dweb
    ".": [ "https://archive.org/" ],  // Handles at least "/about"
    "advancedsearch": ["https://dweb.archive.org/advancedsearch"],
    "details": ["https://dweb.archive.org/archive/archive.html?item="],
    "examples": ["https://dweb.archive.org/archive/examples/"],
    "images": ["https://dweb.archive.org/archive/images/"],
    "serve": ["https://dweb.archive.org/download/"],
    "metadata": [
      "wolk://dweb.archive.org/metadata/",  // TODO-TORRENT move wolk hijacker to use dweb-metadata
      "gun:/gun/arc/archive.org/metadata/", // TODO-TORRENT move gunDB hijacker to use dweb-metadata
      "https://www-dweb-metadata.dev.archive.org/metadata/"], // Obsoletes https://dweb.me/arc/archive.org/metadata/
    "search.php": ["https://dweb.archive.org/archive/archive.html?query="],
    "search": ["https://dweb.archive.org/archive/archive.html?query="]
}
const domains = {
  'dweb:': {
    arc: { "archive.org": archiveOrg },
    ipfs: ["http://ipfs.io/ipfs/", "https://dweb.me/ipfs/"], //TODO maybe need way to say check ipfs: as well ?
  },
}

/**
 * Interpret the string found in domain table
 * @param remainder ARRAY   path split on '/'
 * @returns depending on partialUrl
 *  ANY.html => [ ANYhtml, REMAINDER
 *  ANY?x=   => ANY?x=REMAINDER
 *  ANY/     => ANY/REMAINDER
  */
function expand(partialUrl, remainder) {
  return partialUrl.endsWith("html")
  ? [partialUrl, remainder.join('/')] // THis might always be an error.
  : partialUrl.endsWith("=")
  ? partialUrl + remainder.join('/')
  : (partialUrl.endsWith("/"))
  ? partialUrl+remainder.join('/')
  : undefined;
}
function resolve(parent, table, path) {
  /**
   * parent = [ ]   path components matched so far e.g. [ "dweb:" ] or ["https://archive.org", "metadata" ]
   * table = { key: url || [url]}
   * path = "d/e/f"
   * returns [ url || undefined ]
   */
  //debug("Resolving %o in %s", path, parent);
  const remainder = Array.isArray(path) ? path : path.split('/');
  const name = remainder.shift();
  let found = table[name];
  if (!found && table["."]) {
    remainder.unshift(name); // Didn't use it - pass to "."
    found = table["."];
  }
  if (found) {
    if (Array.isArray(found)) {
      return (found.map(partialUrl => expand(partialUrl, remainder)).filter(url => !!url)); // [url || [url, remainder]]
    } else if (typeof found === "object") {
      return resolve([parent, name].join('/'), found, remainder);
    } else if (typeof found === "string") {
      return [ expand(found, remainder) ]
    }
  } else {
    debug("WARNING unable to resolve %s in %s", name, parent.join('/') || '/' )
    return undefined; // Remainder not found
  }
}

function resolveName(url) {
  return url.startsWith("dweb:/")
    ? resolve(["dweb:"], domains["dweb:"], url.slice(6))
    : url.startsWith("https://archive.org/")
    ? resolve(["https://archive.org"], archiveOrg, url.slice(20) )
    : url.startsWith("http://archive.org/")
    ? resolve(["https://archive.org"], archiveOrg, url.slice(19) )
    : url.startsWith("https://dweb.archive.org/")
    ? resolve(["https://dweb.archive.org"], archiveOrg, url.slice(25) )
    : url; //

}
function naming(names) {
    return [].concat(...names.map(n => resolveName(n)))
}
async function p_namingcb(names) {
  return new Promise((resolve, reject) => { try { const res = naming(names); resolve(res); } catch(err) {reject(err)}}); // Promisify pattern v2b (no CB)
}

/*
//TODO find in DM where its catching http://dweb.me and heading back to http://localhost:4244
const testdata = {
  "dweb:/arc/archive.org/metadata/foo": [
    "https://www-dweb-metadata.dev.archive.org/metadata/foo",
    "gun:/gun/arc/archive.org/metadata/foo",
    "wolk://dweb.archive.org/metadata/foo" ],
  "dweb:/arc/archive.org/details/foo": [
    "https://dweb.me/archive/archive.html?item=foo"],
  "https://archive.org/metadata/bar": [
    'wolk://dweb.archive.org/metadata/bar',
    'gun:/gun/arc/archive.org/metadata/bar',
    'https://www-dweb-metadata.dev.archive.org/metadata/bar'
  ],
  "https://archive.org/something/else": [
    'https://archive.org/something/else'
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

exports = module.exports = {naming, p_namingcb};

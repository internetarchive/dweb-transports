const debug = require('debug')('dweb-transports:naming');

const domains = {
  arc: {
    "archive.org": {
      ".": ["https://dweb.me/archive/archive.html"],
      "about": ["https://archive.org/about/"],
      "details": ["https://dweb.me/archive/archive.html?item="],
      "examples": ["https://dweb.me/archive/examples/"],
      "images": ["https://dweb.me/archive/images/"],
      "serve": ["https://dweb.archive.org/download/"],
      "metadata": [
        "wolk://dweb.archive.org/metadata/",
        "gun:/gun/arc/archive.org/metadata/",
        "https://dweb.me/arc/archive.org/metadata/"],
      "search.php": ["https://dweb.me/archive/archive.html?query="],
      "search": ["https://dweb.me/archive/archive.html?query="],
    },
  },
  ipfs: [ "http://ipfs.io/ipfs/", "https://dweb.me/ipfs/"],
}


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
   * parent = STRING "a/b/c" path matched so far
   * table = { key: url || [url]}
   * path = "d/e/f"
   * returns [ url || [url,remainder]] || undefined
   */
  //debug("Resolving %o in %s", path, parent);
  const remainder = Array.isArray(path) ? path : path.split('/');
  const name = remainder.shift();
  const found = table[name] || table["."]
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
  return url.startsWith("dweb:/") ? resolve([], domains, url.slice(6)) : url; //
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
    "https://dweb.me/arc/archive.org/metadata/foo",
    "gun:/gun/arc/archive.org/metadata/foo",
    "wolk://dweb.archive.org/metadata/foo" ],
  "dweb:/arc/archive.org/details/foo": [
    "https://dweb.me/archive/archive.html?item=foo"],
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

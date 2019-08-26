/*
This Transport layers uses Wolk NoSQL + Cloudstore.
*/
var WOLK
const Url = require('url');
if( typeof window === 'undefined' ) {
  WOLK = require("wolkjs").FS;
} else {
  WOLK = require("wolkjs").WOLK;
}
const canonicaljson = require('@stratumn/canonicaljson');
const debug = require('debug')('dweb-transports:wolk');

// Other Dweb modules
const errors = require('./Errors'); // Standard Dweb Errors
const Transport = require('./Transport.js'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded
const utils = require('./utils'); // Utility functions

let defaultoptions = {
    wolk_addr: "https://cloud.wolk.com",
};

class TransportWOLK extends Transport {
    /* Wolk specific transport */
    constructor(options) {
      super(options);
      this.options = options;         // Dictionary of options
      this.wolk = undefined;
      this.name = "WOLK";          // For console log etc
      this.supportURLs = ['wolk'];
      this.supportFunctions = [ 'fetch',  'connection', 'get', 'set',  ]; // 'store' - requires chunkdata; 'createReadStream' not implemented
      this.supportFeatures = []; // Doesnt support noCache and is mutable

      this.status = Transport.STATUS_LOADED;
    }

    connection(url) {
      debug("connection call")
      var wolknode = new WOLK();
      return wolknode
    }

    //stuff that happens b/f using ntwk bandwidth (config/connect/stuff)
    static setup0(options) {
      let combinedoptions = Transport.mergeoptions(defaultoptions, options.wolk);
      debug("setup options=%o", combinedoptions);
      let t = new TransportWOLK(combinedoptions);
      t.wolk = new WOLK();
      //var successinit = await Promise.all(t.wolk.init())
      t.wolk.setProvider(t.options.wolk_addr);
      Transports.addtransport(t);
      return t;
    }

    //make the connection
    async p_setup1(cb) {
      await this.wolk.init()
      .then( async () => { //TODO-WOLK check - I'm just not familiar with this construct - an async function inside a .then
        if( this.wolk.ecdsaKey == undefined || this.wolk.ecdsaKey == null ) {
          var wolkName = "user" + Math.floor((Math.random() * 1000) + 1);
          debug("createAccount because ecdsaKey null")
          return await this.wolk.createAccount(wolkName)
                  .then( hash => {
                    debug("Account Created: [" + wolkName + "] hash: " + hash + " KEY: " + this.wolk.ecdsaKey)
                  })
                  .catch( err => {
                    throw new Error("Error Creating Account: " + err);
                  })
        }
      })
      .catch( (err) => {
        throw new Error("Error Initializing Wolk: " + err);
      });

      try {
        this.status = Transport.STATUS_STARTING;   // Should display, but probably not refreshed in most case
        if (cb) cb(this);
        await this.p_status();
      } catch(err) {
        this.status = Transport.STATUS_FAILED;
      }
      if (cb) cb(this);
      return this;
    }

    async p_status() {
      /* Return an integer for the status of a transport see Transport */
      return this.wolk.getLatestBlockNumber()
        .then( (bn) => {
          if (bn >= 0) {
            debug("STATUS: connected? [1] = BN: %s", bn)
            this.status = Transport.STATUS_CONNECTED;
          } else {
            debug("STATUS: connected? [0] = BN: %s", bn)
            this.status = Transport.STATUS_FAILED;
          }
          return this.status;
        })
        .catch( (err) => { console.error("Error getting bn: " + err); })
    }

    // ===== DATA ======
    async p_rawstore(chunk) {
      /*
      Store a blob of data onto the decentralised transport.
      Returns a promise that resolves to the url of the data

      :param string|Buffer data: Data to store - no assumptions made to size or content
      :resolve string: url of data stored
      */

      console.assert(chunk, "TransportWOLK.p_rawstore: requires chunkdata");
      /* TODO:
      const rawRes = this.wolk.setChunk(chunk);
      if (rawRes.err) {
          throw new errors.TransportError("Error encountered storing chunk: " + rawRes.err);
      }
      return "wolk://wolk/" + rawRes.h;
      */
    }

    parseWolkUrl(url) {
      var url = Url.parse(url);
      if(url.protocol != "wolk:") {
        throw new errors.TransportError("WOLK Error encountered retrieving val: url (" + url.href + ") is not a valid WOLK url | protocol = " + url.protocol);
      }
      let wolkowner = url.host
      var urlParts = url.path.split("/");
      let wolkbucket = urlParts[1];
      let wolkpath = url.path.substring(wolkbucket.length + 2);
      var wolkurltype = "key"
      if( wolkowner == "wolk" && wolkbucket == "chunk" ) {
        wolkurltype = "chunk"
      }
      let wolkquery = url.query
      return { owner: wolkowner, bucket: wolkbucket, path: wolkpath, urltype: wolkurltype, query: wolkquery }
    }

    async p_rawfetch(url) {
        //TODO: use this.wolk.parseWolkUrl eventually
        var wolkurl = this.parseWolkUrl(url)
/*
        console.log("WOLK p_rawfetch url: " + canonicaljson.stringify(wolkurl));
        console.log("WOLK owner: " + wolkurl.owner);
        console.log("WOLK bucket: " + wolkurl.bucket);
        console.log("WOLK key: " + wolkurl.path);
        console.log("WOLK query: " + wolkurl.query);
        console.log("WOLK urltype: " + wolkurl.urltype);
*/

        var responseData = ""
        if( wolkurl.urltype == "key" ) {
          debug("Checking Wolk NoSQL for: %s", url)
          return this.wolk.getKey(wolkurl.owner, wolkurl.bucket, wolkurl.path, "latest")
            .then(function(responseData) {
              //TODO-WOLK: error checking
              //debug("Response: %s", canonicaljson.stringify(responseData)); //Commented as could be big
              return responseData;
            })
            .catch( (err) => {
              throw new Error("ERROR: p_rawfetch - " + err);
            })
        }
    }

    //=======KEY VALUE TABLES ========
    async p_newdatabase(pubkey) {

    }

    async p_newtable(pubkey, table) {

    }

    async p_set(url, keyvalues, value) {
      /*
      Set key values
      keyvalues:  string (key) in which case value should be set there OR object in which case value is ignored
      */
      var wolkurl = this.parseWolkUrl(url)
/*
      console.log("WOLK p_set url: " + canonoicaljson.stringify(wolkurl));
      console.log("WOLK owner: " + wolkurl.owner);
      console.log("WOLK bucket: " + wolkurl.bucket);
      console.log("WOLK key: " + wolkurl.path);
      console.log("WOLK query: " + wolkurl.query);
      console.log("WOLK urltype: " + wolkurl.urltype);
*/
      if (typeof keyvalues === "string") {
        return this.wolk.setKey(wolkurl.owner, wolkurl.bucket, keyvalues, canonicaljson.stringify(value))
          .then( (hash) => {
            return hash;
          })
          .catch( (err) => {
            throw new Error("TransportWOLK - Error setting key value pair: " + err)
          });
      } else {
        // Store all key-value pairs without destroying any other key/value pairs previously set
        //TODO: Why not support Arrays?
        console.assert(!Array.isArray(keyvalues), "TransportWOLK - shouldnt be passsing an array as the keyvalues");
        //TODO: better understand dictionary objects
        /*
        table.put(
            Object.keys(keyvalues).reduce(
              function(previous, key) {
                previous[key] = canonicaljson.stringify(keyvalues[key]);
                return previous;
              },
              {}
            )
        )
        */
      }
    }

    async p_get(url, keys) {
      var wolkurl = this.parseWolkUrl(url)

      debug("Getting url: %s", canonicaljson.stringify(wolkurl));
/*
      console.log("WOLK owner: " + wolkurl.owner);
      console.log("WOLK bucket: " + wolkurl.bucket);
      console.log("WOLK key: " + wolkurl.path);
      console.log("WOLK query: " + wolkurl.query);
      console.log("WOLK urltype: " + wolkurl.urltype);
*/
      if (Array.isArray(keys)) {
        throw new errors.ToBeImplementedError("p_get(url, [keys]) isn't supported - because of ambiguity better to explicitly loop on set of keys");
        /*
        return keys.reduce(function(previous, key) {
            let val = table.get(key);
            previous[key] = typeof val === "string" ? JSON.parse(val) : val;    // Handle undefined
            return previous;
        }, {});
        */
      } else {
        return this.wolk.getKey(wolkurl.owner, wolkurl.bucket, keys, "latest")
          .then( (value) => { return value; })
          .catch( (err) => {
            throw new errors.TransportError("Error encountered getting keyvalues: " + err);
          })
      }
    }

    async p_delete(url, keys) {
      var wolkurl = this.parseWolkUrl(url)

      if ( typeof keys === "string") {
        return this.wolk.deleteKey(wolkurl.owner, wolkurl.bucket, keys)
          .then( (res) => { return res; })
          .catch( (err) => { throw new errors.TransportError("Error deleting key(s): " + err)})
      } else {
        keys.map( (key) => {
          this.wolk.deleteKey(wolkurl.owner, wolkurl.bucket, key)
        })
      }
    }

    async p_keys(url) {
      var wolkurl = this.parseWolkUrl(url)
      return this.listCollection(wolkurl.owner, wolkurl.bucket, {})
    }

    async p_getall(url) {
      //TODO: difference between this and p_keys
    }
}
Transports._transportclasses["WOLK"] = TransportWOLK;
exports = module.exports = TransportWOLK;

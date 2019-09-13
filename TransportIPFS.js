/*
This is a shim to the IPFS library, (Lists are handled in YJS or OrbitDB)
See https://github.com/ipfs/js-ipfs but note its often out of date relative to the generic API doc.
*/

//TODO-IPFS Note API changes in https://github.com/ipfs/js-ipfs/issues/1721 probably all ipfs.files -> ipfs.

const httptools = require('./httptools'); // Expose some of the httptools so that IPFS can use it as a backup
const debug = require('debug')('dweb-transports:ipfs');

// IPFS components
let IPFS; //TODO-SPLIT move this line lower when fix structure
//TODO-SPLIT remove this import depend on archive.html or node to pre-load
//IPFS = require('ipfs');
//TODO-SPLIT remove this import depend on archive.html or node to pre-load
const ipfsAPI = require('ipfs-http-client');
//We now get this from IPFS.CID
//const CID = require('cids');

// Library packages other than IPFS
const Url = require('url');
const stream = require('readable-stream');  // Needed for the pullthrough - this is NOT Ipfs streams

// Other Dweb modules
const errors = require('./Errors'); // Standard Dweb Errors
const Transport = require('./Transport.js'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded
const utils = require('./utils'); // Utility functions

const defaultoptions = {
    repo: '/tmp/dweb_ipfsv3107', //TODO-IPFS restarted 2018-10-06 because was caching connection ws-star
    //init: false,
    //start: false,
    //TODO-IPFS-Q how is this decentralized - can it run offline? Does it depend on star-signal.cloud.ipfs.team
    config: {
        //      Addresses: { Swarm: [ '/dns4/star-signal.cloud.ipfs.team/wss/p2p-webrtc-star']},  // For Y - same as defaults
        //      Addresses: { Swarm: [ ] },   // Disable WebRTC to test browser crash, note disables Y so doesnt work.
        //Addresses: {Swarm: ['/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star']}, // from https://github.com/ipfs/js-ipfs#faq 2017-12-05 as alternative to webrtc works sort-of
        //Bootstrap: ['/dns4/dweb.me/tcp/4245/wss/ipfs/QmPNgKEjC7wkpu3aHUzKKhZmbEfiGzL5TP1L8zZoHJyXZW'], // Connect via WSS to IPFS instance at IA on FnF
        Bootstrap: ['/dns4/dweb.me/tcp/4245/wss/ipfs/QmQz3p44VVQDeAieaW28DMjcTVzLbpxqaQB9bkXnyd7HY5'], // Connect via WSS to IPFS instance in Kube at IA
        // Previously was: QmQ921MRjsbP12fHSEDcdFeuHFg6qKDFurm2rXgA5K3RQD on kube
    },
    //init: true, // Comment out for Y
    EXPERIMENTAL: { pubsub: true },
    preload: { enabled: false },
    //Off by default, it never seems to have the content (routing issues) pass as an argument if want to use
    //httpIPFSgateway: "https://ipfs.io",
};

class TransportIPFS extends Transport {
    /*
    IPFS specific transport

    Fields:
    ipfs: object returned when starting IPFS
     */

    constructor(options) {
        super(options);
        [ "urlUrlstore", "httpIPFSgateway"].forEach(k => {
            this[k] = options[k];
            delete options[k];
        });
        this.ipfs = undefined;          // Undefined till start IPFS
        this.options = options;         // Dictionary of options
        this.name = "IPFS";             // For console log etc
        this.supportURLs = ['ipfs'];
        this.supportFunctions = ['fetch', 'store', 'seed', 'createReadStream'];   // Does not support reverse
        this.supportFeatures = ['noCache']; // Note doesnt actually support noCache, but immutable is same
        this.status = Transport.STATUS_LOADED;
    }

    _ipfsversion(ipfs, s, cb) {
        ipfs.version((err, data) => {
            if (err) {
                debug("IPFS via %s present but unresponsive: %o", s, data);
                this.ipfstype = "FAILED";
                cb(err);
            } else {
                debug("IPFS available via %s: %o", s, data);
                this.ipfstype = s;
                cb(null, ipfs);
            }
        });
    }
    IPFSAutoConnect(cb) {
        if (global.Ipfs) {
            IPFS = global.Ipfs; //Loaded by <script etc but still need a create
        } else if (window.Ipfs) {
            IPFS = window.Ipfs; //Loaded by <script etc but still need a create
        }
        //TODO-SPLIT I think next few lines are wrong, dont think I've seen global.ipfs or window.ipfs but
        //TODO-SPLIT https://github.com/ipfs/js-ipfs implies global.Ipfs but needs a "create" or "new"
        if (global.ipfs) {
            this._ipfsversion(global.ipfs, "global.ipfs", cb );
        } else if (typeof window !== "undefined" && window.ipfs) {
            this._ipfsversion(window.ipfs, "window.ipfs", cb);
        } else {
            // noinspection ES6ConvertVarToLetConst
            var ipfs = ipfsAPI('localhost', '5001', {protocol: 'http'}); // leaving out the arguments will default to these values
            ipfs.version((err, data) => {
                if (err) {
                    debug("IPFS via API failed %s, trying running own IPFS client", err.message);
                    ipfs = new IPFS(this.options);
                    ipfs.on('ready', () => {
                        this._ipfsversion(ipfs, "client", cb);
                    });   // This only works in the client version, not on API
                    ipfs.on('error', (err) => {
                        debug("IPFS via client error %s", err.message); // Calls error, note this could be a problem if it gets errors after "ready"
                        cb(err);
                    }) // This only works in the client version, not on API
                } else {

                    this._ipfsversion(ipfs, "API", cb); // Note wastes an extra ipfs.version call but that's cheap
                }
            });
        }
    }

    /*OBS
    p_ipfsstart() {
        /-*
        Just start IPFS - not Y (note used with "yarrays" and will be used for non-IPFS list management)
        Note - can't figure out how to use async with this, as we resolve the promise based on the event callback
         *-/
        const self = this;
        return new Promise((resolve, reject) => {
            this.ipfs = new IPFS(this.options);
            this.ipfs.on('ready', () => {
                //this._makepromises();
                resolve();
            });
            this.ipfs.on('error', (err) => reject(err));
        })
            .then(() => self.ipfs.version())
            .then((version) => debug('ready %o',version))
            .catch((err) => {
                console.warn("IPFS p_ipfsstart failed", err.message);
                throw(err);
            });
    }
    */

    static setup0(options) {
        /*
            First part of setup, create obj, add to Transports but dont attempt to connect, typically called instead of p_setup if want to parallelize connections.
        */
        const combinedoptions = Transport.mergeoptions(defaultoptions, options.ipfs);
        debug("setup options=%o", combinedoptions);
        const t = new TransportIPFS(combinedoptions);   // Note doesnt start IPFS
        Transports.addtransport(t);
        return t;
    }

    p_setup1(cbstatus, cb) {
        /* Start IPFS connection
            cbstatus    function(this), for updating status, it must be ale to be called multiple times.
            returns     this via cb(err,res) or promise
            errors      This should never "fail" as it will break the Promise.all, it should return "this" but set this.status = Transport.STATUS_FAILED
         */

        if (cb) { try { f.call(this, cb) } catch(err) { cb(err)}} else { return new Promise((resolve, reject) => { try { f.call(this, (err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}})} // Promisify pattern v2
        function f(cb) {
            // Logged by Transports
            this.status = Transport.STATUS_STARTING;   // Should display, but probably not refreshed in most case
            if (cbstatus) cbstatus(this);
            this.IPFSAutoConnect((err, ipfs) => {  // Various errors possible inc websocket
                if (err) {
                    debug("Failed to connect %s", err.message);
                    this.status = Transport.STATUS_FAILED;
                } else {
                    this.ipfs = ipfs;
                    this.status = Transport.STATUS_CONNECTED;
                }
                if (cbstatus) cbstatus(this);
                cb(null, this); // Don't fail, report the error and set statust to Transport.STATUS_FAILED
            })
        }
    }

    p_setup2(refreshstatus) {
        if (this.status === Transport.STATUS_FAILED) {
            debug("Stage 1 failed, skipping");
        }
        return this;
    }

    stop(refreshstatus, cb) { //TODO-API p_stop > stop
        if (this.ipfstype === "client") {
            this.ipfs.stop((err, res) => {
                this.status = Transport.STATUS_FAILED;
                if (refreshstatus) refreshstatus(this);
                cb(err, res);
            });
        } else {
            // We didn't start it, don't try and stop it
            this.status = Transport.STATUS_FAILED;
            if (refreshstatus) refreshstatus(this);
            cb(miull, this);
        }
    }
    async p_status() {
        /*
            Return a numeric code for the status of a transport.
            TODO - this no longer works if using the http api
         */
        this.status =  (await this.ipfs.isOnline()) ? Transport.STATUS_CONNECTED : Transport.STATUS_FAILED;
        return super.p_status();
    }

    // Everything else - unless documented here - should be opaque to the actual structure of a CID
    // or a url. This code may change as its not clear (from IPFS docs) if this is the right mapping.
    static urlFrom(unknown) {
        /*
        Convert a CID into a standardised URL e.g. ipfs:/ipfs/abc123
         */
        if (unknown instanceof IPFS.CID) //TODO-SPLIT - I think there is a way to get this from a types array
            return "ipfs:/ipfs/"+unknown.toBaseEncodedString();
        if (typeof unknown === "object" && unknown.hash) // e.g. from files.add
            return "ipfs:/ipfs/"+unknown.hash;
        if (typeof unknown === "string")    // Not used currently
            return "ipfs:/ipfs/"+unknown;
        throw new errors.CodingError("TransportIPFS.urlFrom: Cant convert to url from",unknown);
    }

    static cidFrom(url) {
        /*
        Convert a URL e.g. ipfs:/ipfs/abc123 into a CID structure suitable for retrieval
        url: String of form "ipfs://ipfs/<hash>" or parsed URL or CID
        returns: CID
        throws:  TransportError if cant convert
         */
        if (url instanceof IPFS.CID) return url;
        if (typeof(url) === "string") url = Url.parse(url);
        if (url && url["pathname"]) { // On browser "instanceof Url" isn't valid)
            const patharr = url.pathname.split('/');
            if ((!["ipfs:","dweb:"].includes(url.protocol)) || (patharr[1] !== 'ipfs') || (patharr.length < 3))
                throw new errors.TransportError("TransportIPFS.cidFrom bad format for url should be dweb: or ipfs:/ipfs/...: " + url.href);
            if (patharr.length > 3)
                throw new errors.TransportError("TransportIPFS.cidFrom not supporting paths in url yet, should be dweb: or ipfs:/ipfs/...: " + url.href);
            return new IPFS.CID(patharr[2]);
        } else {
            throw new errors.CodingError("TransportIPFS.cidFrom: Cant convert url", url);
        }
    }

    static _stringFrom(url) {
        // Tool for ipfsFrom and ipfsGatewayFrom
        if (url instanceof IPFS.CID)
            return "/ipfs/"+url.toBaseEncodedString();
        if (typeof url === 'object' && url.path) { // It better be URL which unfortunately is hard to test
            return url.path;
        }
    }
    static ipfsFrom(url) {
        /*
        Convert to a ipfspath i.e. /ipfs/Qm....
        Required because of strange differences in APIs between files.cat and dag.get  see https://github.com/ipfs/js-ipfs/issues/1229
         */
        url = this._stringFrom(url); // Convert CID or Url to a string hopefully containing /ipfs/
        if (url.indexOf('/ipfs/') > -1) {
            return url.slice(url.indexOf('/ipfs/'));
        }
        throw new errors.CodingError(`TransportIPFS.ipfsFrom: Cant convert url ${url} into a path starting /ipfs/`);
    }

    ipfsGatewayFrom(url) {
        /*
        url: CID, Url, or a string
        returns:    https://ipfs.io/ipfs/<cid>
         */
        url = this._stringFrom(url); // Convert CID or Url to a string hopefully containing /ipfs/
        if (url.indexOf('/ipfs/') > -1) {
            return this.httpIPFSgateway + url.slice(url.indexOf('/ipfs/'));
        }
        throw new errors.CodingError(`TransportIPFS.ipfsGatewayFrom: Cant convert url ${url} into a path starting /ipfs/`);
    }

    static multihashFrom(url) {
        if (url instanceof IPFS.CID)
            return url.toBaseEncodedString();
        if (typeof url === 'object' && url.path)
            url = url.path;     // /ipfs/Q...
        if (typeof(url) === "string") {
            const idx = url.indexOf("/ipfs/");
            if (idx > -1) {
                return url.slice(idx+6);
            }
        }
        throw new errors.CodingError(`Cant turn ${url} into a multihash`);
    }

    // noinspection JSCheckFunctionSignatures
    async p_rawfetch(url, {timeoutMS=60000, relay=false}={}) {
        /*
        Fetch some bytes based on a url of the form ipfs:/ipfs/Qm..... or ipfs:/ipfs/z....  .
        No assumption is made about the data in terms of size or structure, nor can we know whether it was created with dag.put or ipfs add or http /api/v0/add/

        Where required by the underlying transport it should retrieve a number if its "blocks" and concatenate them.
        Returns a new Promise that resolves currently to a string.
        There may also be need for a streaming version of this call, at this point undefined since we havent (currently) got a use case..

        :param string url: URL of object being retrieved {ipfs|dweb}:/ipfs/<cid> or /
        :resolve buffer: Return the object being fetched. (may in the future return a stream and buffer externally)
        :throws:        TransportError if url invalid - note this happens immediately, not as a catch in the promise
         */
        // Attempt logged by Transports
        if (!url) throw new errors.CodingError("TransportIPFS.p_rawfetch: requires url");
        const cid = TransportIPFS.cidFrom(url);  // Throws TransportError if url bad
        const ipfspath = TransportIPFS.ipfsFrom(url); // Need because dag.get has different requirement than file.cat

        try {
            const res = await utils.p_timeout(this.ipfs.dag.get(cid), timeoutMS, "Timed out IPFS fetch of "+TransportIPFS._stringFrom(cid));   // Will reject and throw TimeoutError if times out
            // noinspection Annotator
            if (res.remainderPath.length)
            { // noinspection ExceptionCaughtLocallyJS
                throw new errors.TransportError("Not yet supporting paths in p_rawfetch");
            }
            let buff;
            if (res.value.constructor.name === "DAGNode") { // Kludge to replace above, as its not matching the type against the "require" above.
                // We retrieved a DAGNode, call files.cat (the node will come from the cache quickly)
                buff = await this.ipfs.cat(ipfspath); //See js-ipfs v0.27 version and  https://github.com/ipfs/js-ipfs/issues/1229 and https://github.com/ipfs/interface-ipfs-core/blob/master/SPEC/FILES.md#cat
            } else { //c: not a file
                debug("Found a raw IPFS block (unusual) - not a DAGNode - handling as such");
                buff = res.value;
            }
            // Success logged by Transports
            return buff;
        } catch (err) { // TimeoutError or could be some other error from IPFS etc
            debug("Caught error '%s' fetching via IPFS", err.message);
            if (!this.httpIPFSgateway) {
                throw(err);
            } else {
                try {
                    debug("Trying IPFS HTTP gateway");
                    let ipfsurl = this.ipfsGatewayFrom(url);
                    return await utils.p_timeout(
                        httptools.p_GET(ipfsurl), // Returns a buffer
                        timeoutMS, "Timed out IPFS fetch of "+ipfsurl)
                } catch (err) {
                    // Failure logged by Transports:
                    //debug("Failed to retrieve from gateway: %s", err.message);
                    throw err;
                }
            }
        }
    }

    async p_rawstore(data) {
        /*
        Store a blob of data onto the decentralised transport.
        Returns a promise that resolves to the url of the data

        :param string|Buffer data: Data to store - no assumptions made to size or content
        :resolve string: url of data stored
         */
        console.assert(data, "TransportIPFS.p_rawstore: requires data");
        const buf = (data instanceof Buffer) ? data : new Buffer(data);
        const res = (await this.ipfs.add(buf,{ "cid-version": 1, hashAlg: 'sha2-256'}))[0];
        return TransportIPFS.urlFrom(res);
    }

    seed({directoryPath=undefined, fileRelativePath=undefined, ipfsHash=undefined, urlToFile=undefined}, cb) {
        /* Note always passed a cb by Transports.seed - no need to support Promise here
            ipfsHash:       IPFS hash if known (usually not known)
            urlToFile:      Where the IPFS server can get the file - must be live before this called as will fetch and hash
            TODO support directoryPath/fileRelativePath, but to working around IPFS limitation in https://github.com/ipfs/go-ipfs/issues/4224 will need to check relative to IPFS home, and if not symlink it and add symlink
            TODO maybe support adding raw data (using add)

            Note neither js-ipfs-http-client nor js-ipfs appear to support urlstore yet, see https://github.com/ipfs/js-ipfs-http-client/issues/969
        */
        // This is the URL that the IPFS server uses to get the file from the local mirrorHttp
        if (!(this.urlUrlstore && urlToFile)) { // Not doing IPFS
            debug("IPFS.seed support requires urlUrlstore and urlToFile"); // Report, though Transports.seed currently ignores this
            cb(new Error("IPFS.seed support requires urlUrlstore and urlToFile")); // Report, though Transports.seed currently ignores this
        } else {
            // Building by hand becase of lack of support in js-ipfs-http-client
            const url = `${this.urlUrlstore}?arg=${encodeURIComponent(urlToFile)}`;
            // Have to be careful to avoid loops, the call to addIPFS should only be after file is retrieved and cached, and then addIPFS shouldnt be called if already cached
            httptools.p_GET(url, {retries:0}, (err, res) => {
                if (err) {
                    debug("IPFS.seed for %s failed in http: %s", urlToFile, err.message);
                    cb(err);    // Note error currently ignored in Transports
                } else {
                    debug("Added %s to IPFS key=", urlToFile, res.Key);
                    // Check for mismatch - this isn't an error, for example it could be an updated file, old IPFS hash will now fail, but is out of date and shouldnt be shared
                    if (ipfsHash && ipfsHash !== res.Key) {  debug("ipfs hash doesnt match expected metadata has %s daemon returned %s", ipfsHash, res.Key); }
                    cb(null, res)
                }
            })
        }
    }
    async p_f_createReadStream(url, {wanturl=false}={}) {
        /*
        Fetch bytes progressively, using a node.js readable stream, based on a url of the form:
        No assumption is made about the data in terms of size or structure.

        This is the initialisation step, which returns a function suitable for <VIDEO>

        Returns a new Promise that resolves to function for a node.js readable stream.

        Node.js readable stream docs: https://nodejs.org/api/stream.html#stream_readable_streams

        :param string url: URL of object being retrieved of form:
            magnet:xyzabc/path/to/file  (Where xyzabc is the typical magnet uri contents)
            ipfs:/ipfs/Q123
        :param boolean wanturl True if want the URL of the stream (for service workers)
        :resolves to: f({start, end}) => stream (The readable stream.)
        :throws:        TransportError if url invalid - note this happens immediately, not as a catch in the promise
         */
        // Logged by Transports;
        //debug("p_f_createreadstream %o", url);
        let stream;
        try {
            let multihash = url.pathname.split('/ipfs/')[1];
            if (multihash.includes('/'))
            { // noinspection ExceptionCaughtLocallyJS
                throw new CodingError("Should not be seeing URLS with a path here:"+url);
            }
            let self = this;
            if (wanturl) { // In ServiceWorker
                return url;
            } else {
                return function createReadStream(opts) {
                    /*
                       The function, encapsulated and inside another function by p_f_createReadStream (see docs)
                       :param opts: { start: byte to start from; end: optional end byte }
                       :returns stream: The readable stream.
                       FOR IPFS this is copied and adapted from git repo js-ipfs/examples/browser-readablestream/index.js
                    */
                    debug("reading from stream %o %o", multihash, opts || "" );

                    const start = opts ? opts.start : 0;
                    // The videostream library does not always pass an end byte but when
                    // it does, it wants bytes between start & end inclusive.
                    // catReadableStream returns the bytes exclusive so increment the end
                    // byte if it's been requested
                    const end = (opts && opts.end) ? start + opts.end + 1 : undefined;
                    // If we've streamed before, clean up the existing stream
                    if (stream && stream.destroy) {
                        stream.destroy()
                    }

                    // This stream will contain the requested bytes

                    // For debugging used a known good IPFS video
                    //let fakehash="QmedXJYwvNSJFRMVFuJt7BfCMcJwPoqJgqN3U2MYxHET5a"
                    //console.log("XXX@IPFS.p_f_createReadStream faking call to",multihash, "with", fakehash)
                    //multihash=fakehash;
                    stream = self.ipfs.catReadableStream(multihash, {
                        offset: start,
                        length: end && end - start
                    });
                    // Log error messages

                    stream.on('error', (err) => console.error(err));

                    /* Gimmick from example :-)
                    if (start === 0) {
                        // Show the user some messages while we wait for the data stream to start
                        statusMessages(stream, log)
                    }
                    */
                    return stream
                };
            }
        } catch(err) {
            if (stream && stream.destroy) {
                stream.destroy()
            }
            // Error logged by Transports
            //console.log(`p_f_createReadStream failed on ${url} ${err.message}`);
            throw(err);
        }
    }

    static async p_test(opts) {
        {console.log("TransportIPFS.test")}
        try {
            const transport = await this.p_setup(opts); // Assumes IPFS already setup
            console.log(transport.name,"setup");
            const res = await transport.p_status();
            console.assert(res === Transport.STATUS_CONNECTED);

            let urlqbf;
            const qbf = "The quick brown fox";
            const qbf_url = "ipfs:/ipfs/zdpuAscRnisRkYnEyJAp1LydQ3po25rCEDPPEDMymYRfN1yPK"; // Expected url
            const testurl = "1114";  // Just a predictable number can work with
            const url = await transport.p_rawstore(qbf);
            console.log("rawstore returned", url);
            const newcid = TransportIPFS.cidFrom(url);  // Its a CID which has a buffer in it
            console.assert(url === qbf_url, "url should match url from rawstore");
            const cidmultihash = url.split('/')[2];  // Store cid from first block in form of multihash
            const newurl = TransportIPFS.urlFrom(newcid);
            console.assert(url === newurl, "Should round trip");
            urlqbf = url;
            const data = await transport.p_rawfetch(urlqbf);
            console.assert(data.toString() === qbf, "Should fetch block stored above");
            //console.log("TransportIPFS test complete");
            return transport
        } catch(err) {
            console.log("Exception thrown in TransportIPFS.test:", err.message);
            throw err;
        }
    }

}
TransportIPFS.requires=['https://unpkg.com/ipfs/dist/index.min.js']; // 2.3Mb


Transports._transportclasses["IPFS"] = TransportIPFS;
// noinspection JSUndefinedPropertyAssignment
exports = module.exports = TransportIPFS;

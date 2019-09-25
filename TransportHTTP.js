const Transport = require('./Transport'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded
const httptools = require('./httptools'); // Expose some of the httptools so that IPFS can use it as a backup
const Url = require('url');
const stream = require('readable-stream');
const debug = require('debug')('dweb-transports:http');
//TODO-SPLIT pull /arc out of here, then dont need by default to hearbeat to dweb.me

defaulthttpoptions = {
    urlbase: 'https://dweb.me',
    heartbeat: { delay: 30000 } // By default check twice a minute
};

class TransportHTTP extends Transport {
  /* Subclass of Transport for handling HTTP - see API.md for docs

    options {
        urlbase:    e.g. https://dweb.me    Where to go for URLS like /arc/...
        heartbeat: {
            delay       // Time in milliseconds between checks - 30000 might be appropriate - if missing it wont do a heartbeat
            statusCB    // Callback  cb(transport) when status changes
        }
    }
   */

    constructor(options) {
        super(options); // These are now options.http
        this.options = options;
        this.urlbase = options.urlbase; // e.g. https://dweb.me
        this.supportURLs = ['http','https'];
        this.supportFunctions = ['fetch'];
        this.supportFeatures = ['noCache'];
        if (typeof window === "undefined") {
            // running in node, can support createReadStream,  (browser can't - see createReadStream below)
            this.supportFunctions.push("createReadStream");
        }
        // noinspection JSUnusedGlobalSymbols
        this.supportFeatures = ['fetch.range', 'noCache'];
        this.name = "HTTP";             // For console log etc
        this.status = Transport.STATUS_LOADED;
    }

    static setup0(options) {
        let combinedoptions = Transport.mergeoptions(defaulthttpoptions, options.http);
        try {
            let t = new TransportHTTP(combinedoptions);
            Transports.addtransport(t);
            return t;
        } catch (err) {
            debug("ERROR: HTTP unable to setup0", err.message);
            throw err;
        }
    }

    p_setup1(statusCB) {
        return new Promise((resolve, unusedReject) => {
            this.status = Transport.STATUS_STARTING;
            if (statusCB) statusCB(this);
            this.updateStatus((unusedErr, unusedRes) => {
                if (statusCB) statusCB(this);
                this.startHeartbeat(this.options.heartbeat);
                resolve(this);  // Note always resolve even if error from p_status as have set status to failed
            });
        })
    }

    async p_status(cb) { //TODO-API
        /*
        Return (via cb or promise) a numeric code for the status of a transport.
         */
        if (cb) { try { this.updateStatus(cb) } catch(err) { cb(err)}} else { return new Promise((resolve, reject) => { try { this.updateStatus((err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}})} // Promisify pattern v2f
    }
    updateStatus(cb) { //TODO-API
        this.updateInfo((err, res) => {
            if (err) {
                debug("Error status call to info failed %s", err.message);
                this.status = Transport.STATUS_FAILED;
                cb(null, this.status); // DOnt pass error up,  the status indicates the error
            } else {
                this.info = res;    // Save result
                this.status = Transport.STATUS_CONNECTED;
                cb(null, this.status);
            }
        });
    }

    startHeartbeat({delay=undefined, statusCB=undefined}) {
        if (delay) {
            debug("%s Starting Heartbeat", this.name)
            this.heartbeatTimer = setInterval(() => {
                this.updateStatus((err, res)=>{ // Pings server and sets status
                    if (statusCB) statusCB(this); // repeatedly call callback if supplies
                }, (unusedErr, unusedRes)=>{}); // Dont wait for status to complete
            }, delay);
        }
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            debug("stopping heartbeat");
            clearInterval(this.heartbeatTimer);}
    }
    stop(refreshstatus, cb) {
        this.stopHeartbeat();
        this.status = Transport.STATUS_FAILED;
        if (refreshstatus) { refreshstatus(this); }
        cb(null, this);
    }

    validFor(url, func, opts) {
        // Overrides Transport.prototype.validFor because HTTP's connection test is only really for dweb.me
        // in particular this allows urls like https://be-api.us.archive.org
        return (this.connected() || (url.protocol.startsWith("http") && ! url.href.startsWith(this.urlbase))) && this.supports(url, func, opts);
    }
    async p_rawfetch(url, opts={}) {
        /*
        Fetch from underlying transport,
        Fetch is used both for contenthash requests and table as when passed to SmartDict.p_fetch may not know what we have
        url: Of resource - which is turned into the HTTP url in p_httpfetch
        opts: {start, end, retries, noCache} see p_GET for documentation
        throws: TransportError if fails
         */
        return await httptools.p_GET(url, opts);
    }

    // ============================== Stream support

    async p_f_createReadStream(url, {wanturl=false}={}) {
        /*
        Fetch bytes progressively, using a node.js readable stream, based on a url of the form:
        No assumption is made about the data in terms of size or structure.

        This is the initialisation step, which returns a function suitable for <VIDEO>

        Returns a new Promise that resolves to function for a node.js readable stream.

        Node.js readable stream docs: https://nodejs.org/api/stream.html#stream_readable_streams

        :param string url: URL of object being retrieved of form  magnet:xyzabc/path/to/file  (Where xyzabc is the typical magnet uri contents)
        :param boolean wanturl True if want the URL of the stream (for service workers)
        :resolves to: f({start, end}) => stream (The readable stream.)
        :throws:        TransportError if url invalid - note this happens immediately, not as a catch in the promise
         */
        //Logged by Transports
        //debug("p_f_createreadstream %s", Url.parse(url).href);
        try {
            let self = this;
            if (wanturl) {
                return url;
            } else {
                return function (opts) { return self.createReadStream(url, opts); };
            }
        } catch(err) {
            //Logged by Transports
            //console.warn(`p_f_createReadStream failed on ${Url.parse(url).href} ${err.message}`);
            throw(err);
        }
    }

    createReadStream(url, opts) {
        /*
        The function, encapsulated and inside another function by p_f_createReadStream (see docs)
        NOTE THIS DOESNT WONT WORK FOR <VIDEO> tags, but shouldnt be using it there anyway - reports stream.on an filestream.pipe aren't functions

        :param file:    Webtorrent "file" as returned by webtorrentfindfile
        :param opts: { start: byte to start from; end: optional end byte }
        :returns stream: The readable stream - it is returned immediately, though won't be sending data until the http completes
         */
        // This breaks in browsers ... as 's' doesn't have .pipe but has .pipeTo and .pipeThrough neither of which work with stream.PassThrough
        // TODO See https://github.com/nodejs/readable-stream/issues/406 in case its fixed in which case enable createReadStream in constructor above.
        debug("createreadstream %s %o", Url.parse(url).href, opts);
        let through;
        through = new stream.PassThrough();
        httptools.p_GET(url, Object.assign({wantstream: true}, opts))
            .then(s => s.pipe(through))
            // Note any .catch is happening AFTER through returned
            .catch(err => {
                console.warn(this.name, "createReadStream caught error", err.message);
                if (typeof through.destroy === 'function') {
                    through.destroy(err); // Will emit error & close and free up resources
                    // caller MUST implimit through.on('error', err=>) or will generate uncaught error message
                } else {
                    through.emit('error', err);
                }
            });
        return through; // Returns "through" synchronously, before the pipe is setup
    }

    async p_createReadStream(url, opts) {
        /*
        The function, encapsulated and inside another function by p_f_createReadStream (see docs)
        NOTE THIS PROBABLY WONT WORK FOR <VIDEO> tags, but shouldnt be using it there anyway

        :param file:    Webtorrent "file" as returned by webtorrentfindfile
        :param opts: { start: byte to start from; end: optional end byte }
        :resolves to stream: The readable stream.
         */
        debug("createreadstream %s %o", Url.parse(url).href, opts);
        try {
            return await httptools.p_GET(url, Object.assign({wantstream: true}, opts));
        } catch(err) {
            console.warn(this.name, "caught error", err);
            throw err;
        }
    }

    async p_info() { //TODO-API
        /*
        Return (via cb or promise) a numeric code for the status of a transport.
         */
        return new Promise((resolve, reject) => { try { this.updateInfo((err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}}) // Promisify pattern v2b (no CB)
    }

    updateInfo(cb) {
        httptools.p_GET(`${this.urlbase}/info`, {retries: 1}, cb);   // Try info, but dont retry (usually heartbeat will reconnect)
    }

    static async p_test(opts={}) {
        {console.log("TransportHTTP.test")}
        try {
            let transport = await this.p_setup(opts);
            console.log("HTTP connected");
            let res = await transport.p_info();
            console.log("TransportHTTP info=",res);
            res = await transport.p_status();
            console.assert(res === Transport.STATUS_CONNECTED);
            await transport.p_test_kvt("NACL%20VERIFY");
        } catch(err) {
            console.log("Exception thrown in TransportHTTP.test:", err.message);
            throw err;
        }
    }

    static async test() {
        return this;
    }

}
Transports._transportclasses["HTTP"] = TransportHTTP;
TransportHTTP.requires = TransportHTTP.scripts = []; // Nothing to load
exports = module.exports = TransportHTTP;


/* global WebTorrent, Buffer */
/* eslint-disable indent, camelcase */ // Until reindent whole file
/* eslint-disable class-methods-use-this */
/*
This Transport layers builds on WebTorrent

Y Lists have listeners and generate events - see docs at ...
*/

// WebTorrent components

// Require in consumer;
// const WebTorrent = require('webtorrent');
// const Url = require('url');
const path = require('path');
const debug = require('debug')('dweb-transports:webtorrent');

// Other Dweb modules
const errors = require('./Errors'); // Standard Dweb Errors
const Transport = require('./Transport.js'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded

const defaultoptions = {
};

class TransportWEBTORRENT extends Transport {
    /*
    WebTorrent specific transport

    Fields:
    webtorrent: object returned when starting webtorrent
     */

    constructor(options) {
        super();
        this.webtorrent = undefined;    // Undefined till start WebTorrent
        this.options = options;         // Dictionary of options
        this.name = 'WEBTORRENT';       // For console log etc
        this.supportURLs = ['magnet'];
        this.supportFunctions = ['fetch', 'createReadStream', 'seed'];
        this.supportFeatures = ['noCache']; // Note doesnt actually support noCache, but immutable is same
        this.setStatus(Transport.STATUS_LOADED);
    }

    static loadIntoNode() {
        super.loadIntoNode(); // should be globally accessible at 'WebTorrent', if not then assign to WebTorrent
        // Dont have opts to check
        // if (connectOpts.transports.includes('WEBTORRENT') && connectOpts.webtorrent && (connectOpts.webtorrent.tracker === 'wrtc')) {
        try {
            const wrtc = 'wrtc'; // Define string to avoid error in webpack when wrtc not installed
            // eslint-disable-next-line import/no-dynamic-require, global-require
            this.wrtc = require(wrtc); // Will be undefined if not installed, used by setup0
        } catch (err) {
            debug('wrtc requested but not present'); // Allow to continue without wrtc
        }
    }

    p_webtorrentstart() {
        /*
        Start WebTorrent and wait until for ready.
         */
        return new Promise((resolve, reject) => {
            this.webtorrent = new WebTorrent(this.options);
            this.webtorrent.once('ready', () => {
                debug('ready');
                resolve();
            });
            this.webtorrent.once('error', (err) => reject(err));
            this.webtorrent.on('warning', (err) => {
                debug('WebTorrent Torrent WARNING: ' + err.message);
            });
        });
    }

    // TODO-SPLIT define load()

    static setup0(options) {
        /*
        First part of setup, create obj, add to Transports but dont attempt to connect, typically called instead of p_setup if want to parallelize connections.
        */
        const combinedoptions = Transport.mergeoptions(defaultoptions, options.webtorrent);
        if (combinedoptions.tracker === 'wrtc') { // We want wrtc
            if (this.wrtc) { // Do we have it (loaded in loadIntoNode, currently no way in browser)
                combinedoptions.tracker = this.wrtc; // replace string 'wrtc' with the code
            } else {
                delete combinedoptions.tracker; // Not available
            }
        }
        debug('setup0: options=%o', combinedoptions);
        const t = new TransportWEBTORRENT(combinedoptions);
        Transports.addtransport(t);
        return t;
    }

    async p_setup1() {
        try {
            this.setStatus(Transport.STATUS_STARTING);
            await this.p_webtorrentstart();
            await this.p_status();
        } catch (err) {
            debug('ERROR %s failed to connect: %s', this.name, err.message);
            this.setStatus(Transport.STATUS_FAILED);
        }
        return this;
    }

    stop(cb) {
        this.webtorrent.destroy((err) => {
            this.setStatus(Transport.STATUS_FAILED);
            if (err) {
                debug('Webtorrent error during stopping %o', err);
            } else {
                debug('Webtorrent stopped');
            }
            cb(err, this);
        });
    }

    async p_status() {
        /*
        Return a string for the status of a transport. No particular format, but keep it short as it will probably be in a small area of the screen.
         */
        if (this.webtorrent && this.webtorrent.ready) {
            this.setStatus(Transport.STATUS_CONNECTED);
        } else if (this.webtorrent) {
            this.setStatus(Transport.STATUS_STARTING);
        } else {
            this.setStatus(Transport.STATUS_FAILED);
        }
        return super.p_status();
    }

    webtorrentparseurl(url) {
        /* Parse a URL
        url:    URL as string or already parsed into Url - should start magnet: or in future might support dweb:/magnet/; some other formats might be supported
        returns:    torrentid, path
         */
        if (!url) {
            throw new errors.CodingError('TransportWEBTORRENT.p_rawfetch: requires url');
        }

        const urlstring = (typeof url === 'string' ? url : url.href);
        const index = urlstring.indexOf('/');

        if (index === -1) {
            throw new errors.CodingError('TransportWEBTORRENT.p_rawfetch: invalid url - missing path component. Should look like magnet:xyzabc/path/to/file');
        }

        const torrentId = urlstring.slice(0, index);
        const pathInTorrent = urlstring.slice(index + 1);

        return { torrentId, pathInTorrent };
    }

    /**
     *
     * @param torrentId     btih ? of the torrent.
     * @param opts          ??
     * @returns {Promise<torrent>}
     */
    async p_webtorrentadd(torrentId, opts) {
      /* TODO Could refactor to take a cb as no async in it, sets up event to call cb but consumers want promises */
        return new Promise((resolve, reject) => {
            // Check if this torrentId is already added to the webtorrent client
            let torrent = this.webtorrent.get(torrentId);

            // If not, then add the torrentId to the torrent client
            if (!torrent) {
                // This can be added in to rewrite a known torrent for example to test a different tracker.
                // let testid = 'magnet:?xt=urn:btih:ELHVM7F4VEOTZQFDHCX7OZXUXKINUIPJ&tr=http%3A%2F%2Fbt1.archive.org%3A6969%2Fannounce&tr=http%3A%2F%2Fbt2.archive.org%3A6969%2Fannounce&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.fastcast.nz&ws=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Fdownload%2F&xs=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Ftorrent%2Fcommute';
                // let testidnewtrack = 'magnet:?xt=urn:btih:ELHVM7F4VEOTZQFDHCX7OZXUXKINUIPJ&tr=http%3A%2F%2Fbt1.archive.org%3A6969%2Fannounce&tr=http%3A%2F%2Fbt2.archive.org%3A6969%2Fannounce&tr=wss%3A%2F%2Fdweb.archive.org:6969&ws=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Fdownload%2F&xs=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Ftorrent%2Fcommute';
                // if (torrentId === testid) torrentId = testidnewtrack;
                torrent = this.webtorrent.add(torrentId, opts);

                torrent.once('error', (err) => {
                    reject(new errors.TransportError('Torrent encountered a fatal error ' + err.message));
                });

                torrent.on('warning', (err) => {
                    debug('WebTorrent Torrent WARNING: %s (%s)', err.message, torrent.name);
                });
            }

            if (torrent.ready) {
                resolve(torrent);
            } else {
                torrent.once('ready', () => {
                    resolve(torrent);
                });
            }
        });
    }

    webtorrentfindfile(torrent, pathInTorrent) {
        /*
        Given a torrent object and a path to a file within the torrent, find the given file.
         */
        const filePath = torrent.name + '/' + pathInTorrent;
        const file = torrent.files.find(f => f.path === filePath);
        if (!file) {
            // debugger;
            throw new errors.TransportError('Requested file (' + pathInTorrent + ') not found within torrent ');
        }
        return file;
    }

  p_rawfetch(url, unusedOpts = {}) {
    /*
    Fetch some bytes based on a url of the form:

    magnet:xyzabc/path/to/file

    (Where xyzabc is the typical magnet uri contents)

    No assumption is made about the data in terms of size or structure.         Returns a new Promise that resolves to a buffer.

    :param string url: URL of object being retrieved
    :resolve buffer: Return the object being fetched.
    :throws:        TransportError if url invalid - note this happens immediately, not as a catch in the promise
    */

    return new Promise((resolve, reject) => {
      // Logged by Transports
      const { torrentId, pathInTorrent } = this.webtorrentparseurl(url);
      this.webtorrentAddFile(torrentId, pathInTorrent)
      .then( (res) => {
        const {torrent, file} = res;
        file.getBuffer((err, buffer) => {
          if (err) {
            reject(new errors.TransportError('Torrent encountered a fatal error ' + err.message + ' (' + torrent.name + ')'));
          } else {
            resolve(buffer);
          }
        });
      })
      .catch((err) => reject(err));
    });
  }

    seed({ fileRelativePath, directoryPath, torrentRelativePath }, cb) {
        /* Add a file to webTorrent - this will be called each time a file is cached and adds the torrent to WT handling so its seeding this (and other) files in directory */
        if (!torrentRelativePath) { // If no torrentfile available then just skip WebTorrent, MirrorFS will often seed the file (eg to IPFS) while its fetching the torrent and then seed that.
            cb(null);
        } else {
            const torrentfile = path.join(directoryPath, torrentRelativePath);
            this.p_addTorrentFromTorrentFile(torrentfile, directoryPath)
                .then(unusedRes => { debug('Added %s/%s to webtorrent', directoryPath, fileRelativePath); cb(null); })
                .catch(err => {
                    if (err.message.includes('Cannot add duplicate torrent')) { // Ignore silently if already added
                        cb(null);
                    } else {
                        debug('addWebTorrent failed %s/%s', directoryPath, fileRelativePath); cb(err);
                    }
                });
        }
    }

    /**
     * Open a torrent, only fetch the specific file, and return torrent and file.
     *
     * @param torrentId         btih (?) of torrent
     * @param pathInTorrent     path within the torrent to the file (? starts with / or not ?)
     * @returns {Promise<{torrent, file}>}
     */
    async webtorrentAddFile(torrentId, pathInTorrent) {
        const torrent = await this.p_webtorrentadd(torrentId);
        torrent.deselect(0, torrent.pieces.length - 1, false); // Dont download entire torrent as will pull just the file we want (warning - may give problems if multiple reads from same webtorrent)
        const file = this.webtorrentfindfile(torrent, pathInTorrent);
        return {torrent, file};
    }

    async _p_fileTorrentFromUrl(url) {
        /*
        Open a webtorrent for the file specified in the path part of the url
        url:    of form magnet:... or magnet/:...
        return: Web Torrent file

        Could refactor to take cb since p_webtorrentadd refactorable
         */
        try {
            const { torrentId, pathInTorrent } = this.webtorrentparseurl(url);
            const { torrent, file} = await this.webtorrentAddFile(torrentId, pathInTorrent);
            if (typeof window !== 'undefined') {   // Check running in browser
                window.WEBTORRENT_TORRENT = torrent;
                window.WEBTORRENT_FILE = file;
                torrent.once('close', () => {
                    window.WEBTORRENT_TORRENT = null;
                    window.WEBTORRENT_FILE = null;
                });
            }
            return file;
        } catch (err) {
            // Logged by Transports
            throw (err);
        }
    }

    /** Used to seed a file, especially when dont have the entire contents of the torrent.
     *
     * @param torrentFilePath file system path to the torrent file
     * @param filesPath file system path to the file to start seeding
     * @returns {Promise<void>}
     */
    async p_addTorrentFromTorrentFile(torrentFilePath, filesPath) {
        try {
            const opts = { path: filesPath };
            const oldTorrent = this.webtorrent.get(torrentFilePath);
            if (oldTorrent) {
                oldTorrent.rescanFiles();
            } else {
                const torrent = await this.p_webtorrentadd(torrentFilePath, opts);
                torrent.deselect(0, torrent.pieces.length - 1, false); // Dont download entire torrent as will pull just the file we want (warning - may give problems if multiple reads from same webtorrent)
            }
        } catch (err) {
            // Logged by Transports
            throw (err);
        }
    }

  // ======= Stream supprot
  // createReadStreamFunction(url, opts, cb) - Transport superclass fine
  // p_f_createReadStream(url, opts, cb) - Transport superclass fine
  // createReadStreamSync(id, opts) - Transport superclass fine
  // createReadStream(url, opts, cb) - Transport superclass fine
  createReadStreamID(url, cb) {
    // TODO unpromisify from here down
    this._p_fileTorrentFromUrl(url)
      .then(filet => cb(null, filet))
      .catch(err => cb(err));
  }

  createReadStreamFetch(filet, opts, cb) {
    cb(null, filet.createReadStream(opts));
  }


/* OBS not supporting Service Workers, but leave as model
    async p_createReadableStream(url, opts) {
        // Return a readable stream (suitable for a HTTP response) from a node type stream from webtorrent.
        // This is used by dweb-serviceworker for WebTorrent only
        const filet = await this._p_fileTorrentFromUrl(url);
        return new ReadableStream({
            start(controller) {
                debug('start %s %o', url, opts);
                // Create a webtorrent file stream
                const filestream = filet.createReadStream(opts);
                // When data comes out of webtorrent node.js style stream, put it into the WHATWG stream
                filestream.on('data', value => controller.enqueue(value));
                filestream.on('end', () => controller.close());
            },
            cancel(reason) {
                throw new errors.TransportError(`cancelled ${url}, ${opts} ${reason}`);
            }
        });
    }
END OF OBS */

    static async p_test(opts) {
      function assertData(data) {
        // Test for a string that is contained within the file
        const expectedWithinData = '00:00:02,000 --> 00:00:05,000';

        console.assert(data.indexOf(expectedWithinData) !== -1, 'Should fetch "Big Buck Bunny.en.srt" from the torrent');

        // Test that the length is what we expect
        console.assert(data.length === 129, '"Big Buck Bunny.en.srt" was ' + data.length);
      }
        let transport;
        try {
            transport = await this.p_setup(opts); // Assumes IPFS already setup
            console.log(transport.name, 'p_test setup', opts, 'complete');
            const res = await transport.p_status();
            console.assert(res === Transport.STATUS_CONNECTED);

            // Creative commons torrent, copied from https://webtorrent.io/free-torrents
            const bigBuckBunny = 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fbig-buck-bunny.torrent/Big Buck Bunny.en.srt';

            let data1 = await transport.p_rawfetch(bigBuckBunny);
            data1 = data1.toString();
            assertData(data1);

            const tStream = await transport.sync_createReadStream(bigBuckBunny);

            const chunks = [];
            tStream.on('data', (chunk) => {
                chunks.push(chunk);
            });
            tStream.on('end', () => {
                const data2 = Buffer.concat(chunks).toString();
                assertData(data2);
            });
        } catch (err) {
            debug('Exception thrown in %s p_test(): %s', transport.name, err.message);
            throw err;
        }
    }
}
Transports._transportclasses.WEBTORRENT = TransportWEBTORRENT;
TransportWEBTORRENT.scripts = ['webtorrent@latest/webtorrent.min.js'];
TransportWEBTORRENT.requires = ['webtorrent']; // Note wrtc loaded in loadIntoNode above

exports = module.exports = TransportWEBTORRENT;
/* Code review by Mitra 2019-12-29 */

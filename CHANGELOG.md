# Change log for dweb-transports

* 0.2.20: Seperate p_GET from GET in httptools	b32b8ed	Mitra Ardron <mitra@mitra.biz>	16Mar2020 at 9:06 PM
* 0.2.19: Move gun to www-dweb-gun.dev.archive.org by default
* 0.2.18: Wrap and then comment out IPFS HTTP API till bit rot fixed
* 0.2.17: Pass error status codes back
* 0.2.15: Webtorrent bug
* 0.2.14: Refactor streaming
* 0.2.14: Factor out LOCAL
* 0.2.13: Move naming to dweb-archivecontroller.routing; add event handler for status
* 0.2.12: Bug fixes in naming refactor
* 0.2.11: Major naming refactor
* 0.2.10: Naming debugging for dweb.archive.org
* 0.2.9: Major naming refactor
* 0.2.8: Better HTTP error handling
* 0.2.7: Hack to handle URL rewrite issue see https://github.com/internetarchive/dweb-mirror/issues/272
* 0.2.6: Move require of wrtc into TransportWEBTORRENT
* 0.2.5: Remove dependencies on ipfs-http-client and wolkjs which need separate installation now, update README to clarify
* 0.2.4: Lighter Fluence transport and Wolk scripting issue
* 0.2.3: Add Fluence transport, split HASH (contenthash) out of HTTP
* 0.2.2: Add Wolk, YJS, and add function for node loading
* 0.2.1: Move script loading into Transports
* 0.2.0: Start moving transport dependencies to consumer, specifically IPFS, GUN, WebTorrent
------
* 0.1.63: Move naming internal
* 0.1.62: Upgrade dependencies
* 0.1.61: loopguard to return correct error from queuedFetch; add info to statuses 
* 0.1.60: Back on master release of webtorrent
* 0.1.59: Add DwebTransports.statuses synchronous API
* 0.1.58: Upgrade GUN and IPFS to v0.35.0 (0.36 breaks webpack as currently configured)
* 0.1.57: Fix heartbeat timer stopping
* 0.1.56: tweak http queue; changes to stop, status, info to support heartbeat on HTTP
* 0.1.55: tweaking queue concurrency
* 0.1.54: queue for http; disable fallback from IPFS to http://ipfs.io
* 0.1.53: Reenable Wolk as fixed
* 0.1.52: Gun fixes but off by default https://github.com/internetarchive/dweb-archive/issues/106
* 0.1.51: Temporary fix to GUN failures by adding wait:2000
* 0.1.50: Update to GUN's new bizarre version numbering. 
* 0.1.49: Disable WOLK - currently failing
* 0.1.48: Support for noCache
* 0.1.47: Update dependencies (see yarn.lock)
* 0.1.46: Correctly recognize /arc/archive.org urls
* 0.1.45: Fix mergeoptions and update ipfs cache id
* 0.1.44: hooks to allow react-based UI in dweb-archive (via IAUX)
* 0.1.43: Add WebTorrent seeding
* 0.1.42: Better behavior when cant see gateway
* 0.1.41: Remove createReadStream for browser (it was added for node in 0.1.40), add fetch(url,opts,cb)
* 0.1.40: Bug fix in httpfetch({count=0}),
* 0.1.40: Added support for "seed" and tested in IPFS
* 0.1.40: WOLK - moved to their production sys and master branch
* 0.1.39: WOLK - updated wolk.js module to fix bugs
* 0.1.38: httptools - adds retries
* 0.1.38: WOLK - added to the library
* 0.1.37: IPFS - dont stop it if we didnt start it (were stopping via API)
* 0.1.37: Start move to unpromisify pattern v5
* 0.1.37: IPFS - updated to (significant) v0.34.0 API changes
* 0.1.36: Made httptools accessable at Transports.httptools so it doesnt have to be separately 'require'd
* 0.1.35: package update (note wont work with latest versions of yjs or uglify)
* 0.1.33: Bug fixes; support for gatewayUrls (for dweb-mirror)

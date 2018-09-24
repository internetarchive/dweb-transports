# Dweb Index and Links
Mitra Ardron - last update 15th September 2018

This is a short document of links relevant to the Dweb Project at the Internet Archive.

This doc will gradually replace the myriad, mostly out of date, links sections in each of the doc files.

## Sites
* [dweb.archive.org](https://dweb.archive.org) - The Internet Archive but decentralized - front page of IA
* [Examples](https://dweb.me/examples) - index of our examples demonstrating libraries and archive site
* [Decentralizedweb.net](https://Decentralizedweb.net) - Webpage for the Decentralized Web Summits of 2016 & 2018

# Repositories
* [Dweb-Gateway](https://github.com/internetarchive/dweb-gateway)  - [README](https://github.com/internetarchive/dweb-gateway/blob/master/README.md), Python Repo, gateway running at IA to dweb resources, and supporting contenthash, btih lookup etc.
* [Dweb-Transports](https://github.com/internetarchive/dweb-transports) - [README](https://github.com/internetarchive/dweb-transports/blob/master/README.md), [API](https://github.com/internetarchive/dweb-transports/blob/master/API.md), Common API to Transports such as IPFS, WEBTORRENT, GUN & HTTP
* [Dweb-Objects](https://github.com/internetarchive/dweb-objects) - [README](https://github.com/internetarchive/dweb-objects/blob/master/README.md), [API](https://github.com/internetarchive/dweb-objects/blob/master/API.md) - Object library - Authentication etc - building on dweb-transports
* [Dweb-Archive](https://github.com/internetarchive/dweb-archive) -  [README](https://github.com/internetarchive/dweb-archive/blob/master/README.md), [Architecture](https://github.com/internetarchive/dweb-archive/blob/master/docs/archive_architecture.md), [Architecture-ipfs](https://github.com/internetarchive/dweb-archive/blob/master/docs/archive_architecture_ipfs.md)  Archive specific UI and classes to handle Archive data, building on dweb-objects and dweb-transports
* [Dweb-Transport](https://github.com/internetarchive/dweb-transport) -  [README](https://github.com/internetarchive/dweb-transport/blob/master/README.md) - Catch all repo with:
    * GUN - modified gun instance that can hijack calls and access IA databases
    * Webtorrent Seeder & Tracker - that collaborate to provide access to all IA torrents
    * URI-forwarding: .[MD](https://github.com/internetarchive/dweb-transport/blob/master/URL-forwards.md) .[JPG](https://github.com/internetarchive/dweb-transport/blob/master/URL-forwards.jpg) Documentation of URI forwarding in various tools
* [Dweb-Serviceworker](https://github.com/internetarchive/dweb-serviceworker) - [README](https://github.com/internetarchive/dweb-serviceworker/blob/master/README.md) - Experimental (incomplete, unused) service worker proxy for Dweb-Transports
* [Dweb-Mirror](https://github.com/internetarchive/dweb-mirror) - [README](https://github.com/internetarchive/dweb-mirror/blob/master/README.md) Mirroring and serving subsets of the Archive - builds on dweb-transports and dweb-objects and dweb-archive
* [Dweb-Universal](https://github.com/mitra42/dweb-universal) - [README](https://github.com//mitra42/dweb-universal/blob/master/README.md)  Overview repo for the 2019 “universal” project - making the IA more accessible where the internet is poor. 
    * [Internet Archive Dweb overview.md](https://github.com/mitra42/dweb-universal/blob/master/Internet Archive Dweb overview.md) Higher level overview of the Dweb projects and repos.
    * [Dweb Universal architecture.pdf](https://github.com/mitra42/dweb-universal/blob/master/Dweb%20Universal%20architecture.pdf) Diagram 
    * [Naming](https://github.com/mitra42/dweb-universal/blob/master/naming.md)  - proposal for naming in the dweb
    * [URI structure for HTTP Server](https://github.com/mitra42/dweb-universal/blob/master/uri%20structure%20for%20http%20server.md)
    * [Xyz but decentralized](https://github.com/mitra42/dweb-universal/blob/master/xyz%20but%20decentralized.md)
* [Dweb-Ext](https://github.com/abhidas17695/dweb-ext/) - [README](https://github.com/abhidas17695/dweb-ext/blob/master/README.md) - Browser extension for booting into the dweb

# Other (older) documents need review and merging
* [Dweb - high level overview](https://docs.google.com/document/d/1-lI352gV_ma5ObAO02XwwyQHhqbC8GnAaysuxgR2dQo/edit#): Overview of the Internet Archive Dweb project. (Sept2018)
* [Dweb - Libraries](https://docs.google.com/document/d/1LU-mbD87jzJGeIGBrxI4XNpczzvsV00kLC64xVXuwZ8/edit#): Overview of Libraries (maybe out of date)
* [Dweb - lists](https://docs.google.com/document/d/1vm-Lze_Gu6gEQUPvh-yRCayCnT82SyECOrd8co3EPfo/edit#): List management library Sep2017
* [Dweb - Authentication: Authentication Library](https://docs.google.com/document/d/1bdcNtfJQ04Twlbef1VZAjQYLmZgpdCFDapQBoef_CGs/edit)
* [Dweb - Naming](https://docs.google.com/document/d/1PwU725r3Kuyu1ALoqOgmFUMlbM2Y8-IIFgMglN59XBM/edit): naming (Domain and Leaf) Library.
* [Dweb - Key Value Pair](https://docs.google.com/document/d/1yfmLRqKPxKwB939wIy9sSaa7GKOzM5PrCZ4W1jRGW6M/edit#heading=h.mkrw566urzdo) (Jan 2018).
* [Dweb - Internet Archive support](https://docs.google.com/document/d/1kLqZqd_hWDW4sGE_9BLs9FLNon1IubeJTLmxYTdv6GA/edit#)
* [Dweb - Roadmap](https://docs.google.com/document/d/1gz7rzjOpcrhyQjEFzQ5KnVz2hAlzQ_I0mq-zDdTjj4A/edit#) - rough outline of things we need to build, and where we are at. (out of date)
* Old mitra42/dweb repo has [docs](https://github.com/mitra42/dweb/tree/master/docs) which are all out of date



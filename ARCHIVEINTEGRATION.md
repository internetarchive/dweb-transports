# Integrating transports with the Internet Archive
First draft: Mitra 23 Nov 2019

Our intention with the dweb-transports and dweb-archive libraries is to be available for integrating with any 
decentralized platform (what we call a transport), and this guide is intended to help the process.

It is a companion to [WRITINGSHIMS.md](./WRITINGSHIMS.md)

Feel free to ask start an "issue" for your platform in the 
[dweb-transports](https://github.com/internetarchive/dweb-transports/issues) repo.

If you are working on integration, please also add a comment to
[dweb-transports issue#10](https://github.com/internetarchive/dweb-transports/issues/10)

## Overview

Depending on what you are trying to achieve with the integration,
there are two pathways to integrating with the Internet Archive and this library, 

1. To use this library as a platform neutral layer to allow an application to use multiple transports,
    you should just need to write a shim - see [WRITINGSHIMS.md](./WRITINGSHIMS.md)
    
2. To serve Internet Archive content in the dweb.archive.org UI, via your platform, you'll need 
   to write a shim  (see [WRITINGSHIMS.md](./WRITINGSHIMS.md) ) and a Hijacker (see below). 

3. To prove your platform can handle storage at scale, by supporting the Internet Archive backend,
   you probably want to build a proxy from http to your cloud to the archive (see below). 

## Writing a hijacker or Proxy

Integration into the Archive content via your platform, will definately require a more in-depth collaboation, 
but below is an outline.

The key challenge is that the Archive has about 50 petabytes of data, 
and none of the distributed platforms can pratically handle that currently.
So we use 'lazy-seeding' techniques to push/pull data into a platform as its requested by users. 

Optionally, if the process of adding a, possibly large, item is slow (e.g. in IPFS, WEBTORRENT),  
some subset of Archive resources could be pre-crawled and those files pre-seeded to the platform. 
The biggest challenge in that preseeding is scalably keeping a mapping from Archive addresses to addresses
in the transport. This needs to be managed by the hijacker.

In most cases, we presume that we start off with the peer running at your site, 
and once it is debugged we run a (potentially) modified peer at the Archive, 
so that interaction between the Archive servers and the system is fast and bandwidth essentially free.
We call this peer a "SuperPeer"

In case its useful .... your superpeer can easily have access to:
* A persistent volume available to each peer at e.g. /pv/yourplatformname
* An implementation of REDIS answering on 0.0.0.0:6379 which saves to the persistent volume
* A HTTPS or WSS proxy (we prefer this over giving access to dweb.me's certificate to the superpeer)
* Log files (including rotation) which should be at /var/log/dweb/dweb-yourplatformname
* Cron (not currently used, but can be)

The hijacker will run in its own pseudo-server, in a Kubernetes cluster, on its own domain name which will look like 
www-dweb-yourplatformname.dev.archive.org.  
It will need to answer with http (or ws) on port 5000, 
but we can also open up specific ports if needed for interaction over your own protocol. 
The answer on port 5000 can be as simple as a "hello world" response so we know its alive.

## Hijacking and Proxying

### Hijacking
Hijacking is used to map the Internet Archive address space into your platforms, and the hijacker typically runs 
on the Archive's network. 

The Hijacking approach is taken by GUN and WOLK, where their peer catches an address pattern, maps it to an Archive address, 
and fetches the content via that URL, decentralizing the result in their cloud.

### Proxying

Proxying maps the Archive's https URLs to your cloud. A typical proxy will
* Determine if the https URL has already been fetched
* If so, then fetch from your cloud 
* If not, then fetch from the Archive, insert in your cloud, and remember the mapping. 

We think that both hijacking and proxying are functions of generic use beyond just the Archive, 
that allow a decentralized system to coexist with legacy (centralized) data
and allow it to cache and share legacy data in a decentralized fashion prior to having the scale and abiliy to absorb 
all the data on the platform.

### Details of Hijacking functionaliity

Obviously this could run quite complex functionality but in may cases simple mapping between Archive URLs and 
platform addresses will work well.

See [dweb-transport/gun/gun_https_hijackable.js](https://github.com/internetarchive/dweb-transport/blob/master/gun/gun_https_hijackable.js) for the code modification 
and `[gun_https_archive.js](https://github.com/internetarchive/dweb-transport/blob/master/gun/gun_https_archive.js)` for the configuration that maps `/arc/archive/metadata` to `https://www-dweb-metadata.dev.archive.org/metadata/` so that for example
`gun:/arc/archive/metadata/commute` retrieves metadata for the `commute` Internet Archive item at [https://www-dweb-metadata.dev.archive.org/metadata/commute].

This will also work if the address of the table is a hash for example `xyz:/xyz/Q1234567/commute` 
where `Q1234567` would be `xyz`'s address for the metadata table. 
The mapping to that table's address can be hard-coded in code, or included in the dweb-archive-controller repo in Routing.js.

The dweb-archive code needs to know the reverse mapping (e.g. from Archive URLs to GUN addresses) 
and this is configured in the dweb-archivecontoller repo in Routing.js.

You should map three Archive address forms at least:
* https://archive.org/metadata/foo to fetch the metadata
* https://archive.org/download/foo/foo.mp3 to fetch a file
* https://archive.org/services/img/foo to retrieve a small thumbnail.

### Details of Proxing functionaliity

Proxying is simpler, because the mapping between Archive and cloud addresses is purely internal to the proxy,
and no shim is required. 

### Hijacking by hashes or similar no longer supported

In the past we have setup mapping to hashes, but this has severe performance implications, 
that mean it doesn't scale to large amounts of content on multiple systems.

For WebTorrent we precalculate torrents during ingestion and include them in the metadata.
This doesn't scale well given the amount of content added to the Archive each day, 
and the relatively small amount accessed via WebTorrent.

For IPFS we were adding files on demand, saving the IA address/IPFS address in REDIS and returning IPFS address in metadata.
This didn't scale because: 
* the adding process was slow, slowing down metadata retrieval, 
* there was no way to scalably add this mapping to IPFS's DHT;
* stale IPFS addresses led to an endless delay rather than quick failures
* there was no scalable decentralized mapping between the names and IPFS addresses, so clients had to contact our servers anyway.

Given these scaling problems we are unlikely to consider a similar approach ourselves, 
but are open to being talked into a similar approach if your hikacher or proxy is handling the seeding and name mapping.


## Installation for testing and production integration.

To make this work we'll need ... 
* For a hijacker - a pull request on dweb-transports for the shim (see [WRITINGSHIMS.md](./WRITINGSHIMS.md) )
* For hijacker or proxy - access to a repo (or branch) for the platform that has the hijacking/proxying code.

This should have at least a `Dockerfile`, 
files like `CHANGELOG.md` `CONTRIBUTING.md` and `logo.png` are encouraged.

The `Dockerfile` will need some or all of the following lines: 

Expose port 5000 to the world via port 80 (Port 80 will actually be behind a https proxy)

```
EXPOSE 80 5000
```
If you want to expose any other ports, put the code in similar lines, but talk to us about the mapping etc.

Create a directory in the persistent volume.
Note these are run each time a dockerfile starts so need to be safe to run multiple times e.g.
```
RUN mkdir -p -m777 /pv/gun
```
A command to run under supervisor (so that it restarts) e.g.
```
CMD [ "./node_modules/.bin/supervisor", ".", "Main.js" ]
```
Any cron setup you need e.g.
TODO this needs checking - we aren't currently using cron in any hijackers/proxys.
```
RUN echo '3 * * * *  root node /app/cron_hourly.js' > /etc/cron.d/dweb 
```

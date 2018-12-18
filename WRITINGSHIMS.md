# Writing Shims to the Internet Archive and to the dweb-transports library

First draft: Mitra 18 Dec 2018

Our intention with the dweb-transports and dweb-archive libraries is to be open about integrating with any decentralized platform (what we call a transport), 
and this guide is intended to help the process.

In our experience the process of adding a transport to a platform is pretty easy **when** we collaborate with someone intimately familiar with the platform.
So feel free to ask questions in the [dweb-transports](https://github.com/internetarchive/dweb-transports/issues) repo,
and to reach out to [Mitra](mitra@archive.org) for assistance. 

If you are working on integration, please add a comment to [dweb-transports#10](https://github.com/internetarchive/dweb-transports/issues/10)

TODO make links to some of the files in other repos, for now dweb-objects for example refers to https://github.com/internetarchive/dweb-objects

## Overview

Integrating a Dweb platform (aka Transport) into this library has two main stages.

1. integration into the dweb-transports repo, 
which mostly involves writing a file with a name like TransportXYZ.js 
and integrating in a couple of places. This can be done entirely by a third party,
though it will work smoother with collaboration.
2. integrating a shim that enables the Internet Archive's content to be available 
in the decentralized platform either via the dweb.archive.org UI or otherwise.
This is only necessary if you want to make IA content available, 
and will require our assistance to integrate with code that runs on IA servers.

Step 2 requires our help as the code has to run on our servers, but 
Step 1 can be done entirely by the third parties, though in both cases collaboration 
should make the process go smoother.

## Integration into the Dweb-transports repo

The main code sits in a file named something like TransportXYZ.js. 

In this file are implementations of:
* Chunks - storing and retrieving opaque data as a chunk or via a stream.
* KeyValues - setting and getting the value of a key in a table. 
* Lists - append only logs.

See [API.md](./API.md) and the existing code examples for detailed function by function documentation. 

#### Integration other than TransportXYZ.js

Searching for `SEE-OTHER-ADDTRANSPORT` should find any places in the code where a tweak is required to add a new transport. 

To assist finding them they include:

* index.js: needs to require the new TransportXYZ
* package.json/dependencies: Should specify which version range of a transport to include
* API.md: Has overview documentation
* Transports.js: Add a function like: http(), gun() etc: allow finding loaded transports (for example can be used by one transport to find another).
* Transports.js: Add to p_connect()

#### Partial implementation.

Its perfectly legitimate to only implement the parts of the API that the transport implements, 
though it will work better if the others are implemented as well, 
for example:
* a list can be implemented on top of a KeyValue system by adding a new item with a key being a timestamp.
* key-value can be implemented on top of lists, by appending a {key: value} data structure, and filtering on retrieval.

**monitor** and **listmonitor** will only work if the underlying system supports them, and its perfectly reasonable not to implement them. 
They aren't currently used by the dweb-archive / dweb.archive.org code.

Make sure that `TransportXYZ.js` `constructor()` correctly covers what functions are implemented in the `.supportFunctions` field. 
This field is used by Transports to see which transports to try for which functionality.

## Integration into the Archive's servers. 

Integration into the Archive content will definately require a more in-depth collaboation, 
but below is an outline.

The key challenge is that the Archive has about 50 petabytes of data, 
and none of the distributed platforms can pratically handle that currently.
So we use 'lazy-seeding' techniques to push/pull data into a platform as its requested by users. 
Optionally we can crawl some subset of resources and pre-seed those to the platform if the process of adding a, possibly large, item is slow (e.g. in IPFS, WEBTORRENT)

In all cases, we presume that we run a (potentially) modified peer at the Archive, 
so that interaction between the Archive servers and the system is fast and bandwidth essentially free.
We call this peer a "SuperPeer"

In case its useful .... our servers have:
* A persistent volume available to each peer at e.g. /pv/gun
* An implementation of REDIS answering on 0.0.0.0:6379 which saves to the persistent volume
* A HTTPS or WSS proxy (we prefer this over giving access to dweb.me's certificate to the superpeer)
* Log files
* cron (not currently used, but can be)

These are available to superpeers but will require some liason so we know how they are being used.

### Conventions
Please follow conventions i.e. 
* Code location `/usr/local/<repo-name>` e.g. `/usr/local/dweb-transports`
* Persistent volume `/pv/<transportname>` e.g. `/pv/gun`
* Log files `/var/log/dweb/dweb-<transportname>` e.g. `/var/log/dweb/dweb-gun`

### Options for integration: Hijack, Push, Hybrid

The actual choices to be made will depend on some of the differences between transports, specifically.
* Is data immutable, and refered to by a content address or hash (IPFS, WEBTORRENT), or is it mutable and refered to by a name. (GUN, YJS)
* Will it be easier to 
1. 'hijack' specific addresses and use the peer to initiate retrieval from our servers (GUN)
2. Have the server Push data into the platform and share the hash generated by the platform in the metadata (IPFS) and/or pass a URL to the platform which it can pull and return its hash.
3. Hybrid - precalculate content addresses during item creation, then hijack the request for the data (this is expensive for the Archive so is going to take a lot longer to setup). (WEBTORRENT)

Each of these requires a different technique. 

#### 1. Hijacking

For hijacking, currently used by GUN, the peer implements in its code,
a way to map from a specific address to an action, with the simplest being a URL access.

We think that hijacking is a generically useful function 
that allows a decentralized system to coexist with legacy (centralized) data
and be able to cache and share it in a decentralized fashion prior to an abiliy to absorb all the data on the platform.

Obviously this could run quite complex functionality but in may cases simple mapping to URLs on our gateway will work well.

See `dweb-transport/gun/gun_https_hijackable.js` for the code modification 
and `gun_https_archive.js` for the configuration that maps `/arc/archive/metadata` to `https://dweb.me/arc/archive.org/metadata/` so that for example
`gun:/arc/archive/metadata/commute` retrieves metadata for the `commute` Internet Archive item at `https://dweb.me/arc/archive.org/metadata/commute`.

The dweb-archive code needs to know to try Gun for the metadata, and this is configured in dweb-objects/Domain.js/p_setupOnce() which we have to run. 
Note that this configuration mechanism is likely to change in the future though the address (on GUN) checked should remain the same.

TODO write up integration to files

#### 2. Push 

This is more complex, and less preferably to Hijacking, and can only integrate files access, not metadata. 
This is used for IPFS.

In most cases this will be used 

We will need a HTTP API, and a snippet of code (currently only python is supported) that we can integrate. 

It should have a signature like:
```
def store(self, data=None, # If passed, this data will be pushed
    urlfrom=None,   # The URL at which the superpeer can access the data, note this URL may not be accessible to other peers
    verbose=False,  # Generate debugging info
    mimetype=None,  # Can be passed to the superpeer if required by its HTTP API
    pinggateway=True, # On some platforms (IPFS) we can optionally ping a (central) address to encourage propogation
    **options):     # Catchall for other future options
```
and should return a string that is the URL to be used for access, e.g. `ipfs:/ipfs/Q12345`

We'll need to integrate it into `dweb-gateway` in `Archive.py.item2thumbnail()` and `NameResolve.py/cache_content()`

#### 3. Hybrid - Precalculate + hijack.

For WebTorrent we have done a much more complex process which we dont want to do again if possible. 
At least until some platform is already operating at scale.  
However there may be some hints in its structure at options for superpeers.
 
It involves:

* The torrent magnet links are calculated when as we add items to the Archive, and have been batch run on the entire archive (expensive!) and indexed.
* The torrents include pointers to a superpeer Tracker
* Those links are added into the metadata in `ArchiveItem.new()` and `ArchiveFile.new()`
* The superpeer Tracker pretends that any magnet link is available at the Seeder
* The seeder access a specific URL like btih/12345 
* The gateway looks up the BTIH and returns a torrent file 
* The seeder uses the torrent file to fetch and return the required data

### Installation for testing

To make this work we'll need ... 
* Pull request on dweb-objects, dweb-transports.
* Access to a repo (or branch) for the platform that has the hijacking code, this can be 
either a separate repo or a pull request on dweb-transport where you can take over a directory (GUN does this).

### Installation for production integration

We'll then need some info to help us integrate in our Docker production system which will include:

* Any one-time instructions to run in `superv`. 
Note these are run each time a dockerfile starts so need to be safe to run multiple times e.g.
```
    # gun setup
    mkdir -p -m777 /pv/gun
```

* Any ports that need exposing or mapping to go in `chart/templates/template.yaml` e.g.
```
    - name: wsgun
      containerPort: 4246
```
and in `chart/templates/service.yaml`
```
    - port: 4246
      targetPort: 4246
      name: wsgun
      protocol: TCP
```
and in ports-unblock.sh 
```
proto tcp dport 4246 ACCEPT;  # GUN  websockets port
```
* Startup info to go in `supervisor.conf` e.g. 
```
    [program:dweb-gun]
    command=node /usr/local/dweb-transport/gun/gun_https_archive.js 4246
    directory = /pv/gun
    stdout_logfile = /var/log/dweb/dweb-gun
    stdout_logfile_maxbytes=500mb
    redirect_stderr = True
    autostart = True
    autorestart = True
    environment=GUN_ENV=false
    exitcodes=0
```
* Docker setup
You can presume the the docker has the following before your install, 
this should be pretty standard for NodeJS, Python3 or Go applications, and you can add other packages you need.
```
    FROM ubuntu:rolling
    RUN apt-get -y update  &&  apt-get -y install redis-server supervisor zsh git python3-pip curl sudo nginx python3-nacl golang nodejs npm cron
    COPY .   /app/
    COPY etc /etc/
    RUN mkdir -p /var/log/dweb
```
Typically your code would then look something like the following nodejs example (Go and Python3 examples on request)
```
    RUN apt-get -y install anyOtherPackagesYouNeed
    RUN cd /usr/local && git clone https://github.com/<yourRepo || internetarchive/dweb-transport> \
        && cd /usr/local/<yourRepo> && npm install
        && ln -s /pv/xyz /usr/local/<yourRepo>/someinternaldirectory
    #Setup any cron call if required
    RUN echo '3 * * * *  root node /usr/local/yourRepo/cron_hourly.js' > /etc/cron.d/dweb 
    ENV XYZABC="some environment info you need"
    # Expose any defaults you need
    EXPOSE 1234
```
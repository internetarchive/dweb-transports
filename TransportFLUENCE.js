const Url = require('url');
const Transport = require('./Transport'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded
const errors = require('./Errors'); // Standard Dweb Errors
const canonicaljson = require('@stratumn/canonicaljson');
//const fluence = require('fluence');

const debug = require('debug')('dweb-transports:fluence');

const defaultOptions = {
    nodeUrl: 'https://ia-redis.fluence.one',
    nodePort: 443,
    appId: '4' // Redis
};

class TransportFLUENCE extends Transport {

    constructor(options) {
        super(options);
        this.options = options;         // Dictionary of options
        this.session = undefined;
        this.name = 'FLUENCE';          // For console log etc
        this.supportURLs = ['fluence'];
        this.supportFunctions = [
            // General data functions
            'fetch', //         p_rawfetch(url, {timeoutMS, start, end, relay}) – Fetch some bytes based on a url

            // Lists functions
            'list', //          p_rawlist(url)               – Fetch all the objects in a list .. identified by the url of the .. 'signedby' parameter of the p_rawadd call
            'add', //           p_rawadd(url, sig)           – Store a new list item, it should be stored so that it can be retrieved either by "signedby" (using p_rawlist) or by "url" (with p_rawreverse).
            'newlisturls', //   p_newlisturls(cl)            – Obtain a pair of URLs for a new list

            // KeyValueTable functions
            'newdatabase', //   p_newdatabase(pubkey)        – Create a new database based on some existing object
            'newtable', //      p_newtable(pubkey, table)    – Create a new table
            'get', //           p_get(url, keys)             – Get one or more keys from a table
            'set', //           p_set(url, keyvalues, value) – Set one or more keys in a table.
            'getall',//         p_getall(url)                – Return a dictionary representing the table
            'keys', //          p_keys(url)                  – Return a list of keys in a table (suitable for iterating through)
        ];
        this.supportFeatures = [];
        this.status = Transport.STATUS_LOADED;
    }

    static setup0(options) {
        const combinedOptions = Transport.mergeoptions(defaultOptions, options.fluence);

        console.assert(combinedOptions.nodeUrl, 'Fluence Node url should be specified');
        console.assert(combinedOptions.nodePort, 'Fluence Node port should be specified');
        console.assert(combinedOptions.appId, 'Fluence AppId should be specified');

        let t = new TransportFLUENCE(combinedOptions);
        Transports.addtransport(t);
        return t;
    }

    async p_setup1(cb) {
        try {
            this.status = Transport.STATUS_STARTING;
            debug('connecting...');

            if (cb) cb(this);

            const rndString = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            this.session = fluence.directConnect(this.options.nodeUrl, this.options.nodePort, this.options.appId, rndString);

            debug('connected.');

            this.status = Transport.STATUS_CONNECTED;
        } catch (err) {
            console.error(this.name, 'failed to start', err);
            this.status = Transport.STATUS_FAILED;
        }

        if (cb) cb(this);
        return this;
    }


    async p_status() {
        if (this.session !== null && this.session !== undefined) {
            this.status = Transport.STATUS_CONNECTED;
        }

        return super.p_status();
    }

    parseUrl(url) {
        const parsedUrl = Url.parse(url);
        if (parsedUrl.protocol !== 'fluence:') {
            throw new errors.TransportError(`TransportFLUENCE Error encountered retrieving val: url (${parsedUrl.href}) is not a valid FLUENCE url | protocol = ${parsedUrl.protocol}`);
        }

        debug('retrieve url', parsedUrl.href);

        return parsedUrl;
    }

    newKey(pubkey) {
        if (pubkey.hasOwnProperty("keypair")) {
            pubkey = pubkey.keypair.signingexport();
        }
        // By this point pubkey should be an export of a public key of form xyz:abc where xyz
        // specifies the type of public key (NACL VERIFY being the only kind we expect currently)
        return `fluence:/fluence/${encodeURIComponent(pubkey)}`;
    }

    parseRedisResponse(result) {

        if (result.startsWith('$-1')) {
            return undefined;
        }

        function parseResponsePart(result) {
            const [, type, countStr] = /^([\+\-\:\$\*]{1})([0-9]+)/.exec(result);
            const count = Number(countStr);

            switch (type) {
                case '+': { // Simple string
                    const offset = 1;
                    const [, data] = /([^\n\r]+)/.exec(result.substring(offset));
                    return {
                        data: data,
                        offset: offset + data.length + 2
                    };
                }
                case ':': {  // Integer
                    const offset = 1;
                    const [, data] = /([0-9]+)/.exec(result.substring(offset));
                    return {
                        data: Number(data),
                        offset: offset + data.length + 2
                    };
                }
                case '$': { // Bulk string
                    const offset = 1 + String(count).length + 2;
                    return {
                        data: result.substring(offset, offset + count),
                        offset: offset + count + 2
                    };
                }
                case '*': {  // Array
                    let offset = 1 + String(count).length + 2;
                    const list = [];
                    for(let i = 0;i < count;i++) {
                        const parsedListItem = parseResponsePart(result.substring(offset));
                        list.push(parsedListItem.data);
                        offset += parsedListItem.offset;
                    }

                    return {
                        data: list,
                        offset: null
                    };
                }
                default: {
                    throw new errors.TransportError(`TransportFLUENCE Error unsupprted Redis response type: ${type}, response: ${result}`);
                }
            }
        }

        return parseResponsePart(result).data;
    }

    // General data functions (uses Redis basic GET\SET)

    async p_rawfetch(url) {
        const parsedUrl = this.parseUrl(url);
        const key = parsedUrl.path;

        const result = await this.session.request(`GET ${key}`);
        const data = this.parseRedisResponse(result.asString());

        if (!data) {
            throw new errors.TransportError(`TransportFLUENCE unable to retrieve: ${url.href}`);
        }

        return typeof data === 'string' ? JSON.parse(data) : data;
    }

    // List functions (uses Redis list)

    async p_rawlist(url) {
        const parsedUrl = this.parseUrl(url);
        const key = parsedUrl.path;

        const result = await this.session.request(`LRANGE ${key} 0 -1`);
        const data = this.parseRedisResponse(result.asString());

        if (!data) {
            throw new errors.TransportError(`TransportFLUENCE unable to retrieve list: ${url.href}`);
        }

        return data.map(listItem => typeof listItem === 'string' ? JSON.parse(listItem) : listItem);
    }

    async p_rawadd(url, sig) {
        const parsedUrl = this.parseUrl(url);
        const key = parsedUrl.path;

        const data = canonicaljson.stringify( sig.preflight( Object.assign({}, sig)));

        await this.session.request(`RPUSH ${key} ${data}`);
    }

    async p_newlisturls(cl) {
        const key = this.newKey(cl);

        return [key, key];
    }

    // KeyValueTable functions (uses Redis hashes)

    async p_newdatabase(pubkey) {
        /*
            Request a new database
            returns: { publicurl: "fluence:/fluence/<publickey>", privateurl:  "fluence:/fluence/<publickey>"> }
        */
        let key = await this.newKey(pubkey);
        return {
            publicurl: key,
            privateurl: key
        };
    }

    async p_newtable(pubkey, table) {
        /*
            Request a new table
            returns: {publicurl: "fluence:/fluence/<publickey>/<table>", privateurl:  "fluence:/fluence/<publickey>/<table>">
        */
        if (!pubkey) {
            throw new errors.CodingError("p_newtable currently requires a pubkey");
        }

        const { publicurl, privateurl } = await this.p_newdatabase(pubkey);
        return {
            privateurl: `${privateurl}/${table}`,
            publicurl: `${publicurl}/${table}`
        };
    }

    async p_set(url, keyvalues, value) {  // url = fluence:/fluence/<publickey>/<table>
        /*
            Set key values
            keyvalues:  string (key) in which case value should be set there OR
                object in which case value is ignored
        */

        if (typeof keyvalues === 'string') {
            await this.session.request(`HSET ${url} ${keyvalues} ${canonicaljson.stringify(value)}`);
        } else {
            // Store all key-value pairs without destroying any other key/value pairs previously set
            console.assert(!Array.isArray(keyvalues), 'TransportFLUENCE - shouldnt pass an array as the keyvalues');

            await Promise.all(
                Object.keys(keyvalues).map(hKey => this.session.request(`HSET ${url} ${hKey} ${canonicaljson.stringify(keyvalues[hKey])}`))
            );
        }
    }

    async p_get(url, keys) {
        if (Array.isArray(keys)) {
            const result = await this.session.request(`HMGET ${url} ${keys.join(' ')}`);
            const data = this.parseRedisResponse(result.asString());

            return keys.reduce((store, key, index) => {
                const keyValue = data[index];
                store[key] = typeof keyValue === "string" ? JSON.parse(keyValue) : keyValue;

                return store;
            }, {});
        } else {
            const result = await this.session.request(`HGET ${url} ${keys}`);
            let data = this.parseRedisResponse(result.asString());

            return typeof data === 'string' ? JSON.parse(data) : data;
        }
    }

    async p_keys(url) {
        const result = await this.session.request(`HKEYS ${url}`);

        return this.parseRedisResponse(result.asString());
    }

    async p_getall(url) {
        const result = await this.session.request(`HGETALL ${url}`);
        const dataArray = this.parseRedisResponse(result.asString());

        return dataArray.reduce((store, key, index, dataArray) => {
            if (index % 2 !== 0) {
                return store;
            }

            const keyValue = dataArray[index + 1];
            store[key] = typeof keyValue === "string" ? JSON.parse(keyValue) : keyValue;

            return store;
        }, {});
    }

    async p_delete(url, keys) {
        if (typeof keys === "string") {
            await this.session.request(`HDEL ${url} ${keys}`);
        } else {
            await this.session.request(`HDEL ${url} ${keys.join(' ')}`);
        }
    }
}

Transports._transportclasses['FLUENCE'] = TransportFLUENCE;
TransportFLUENCE.scripts = ["fluence@0.3.14-no-webj/bundle/bundle.js"];
TransportFLUENCE.requires = {"fluence": "fluence"};

exports = module.exports = TransportFLUENCE;

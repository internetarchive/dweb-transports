const errors = require('./Errors');

utils = {}; //utility functions

// ==== OBJECT ORIENTED JAVASCRIPT ===============
// This is a general purpose library of functions,
//Parts of this file (consolearr, and createElement) are duplicated in dweb-transport; dweb-transports and dweb-objects repo

// Utility function to print a array of items but just show number and last.
utils.consolearr  = (arr) => ((arr && arr.length >0) ? [arr.length+" items inc:", arr[arr.length-1]] : arr );

utils.stringfrom = function(foo, hints={}) {
    try {
        // Generic way to turn anything into a string
        if (foo.constructor.name === "Url") // Can't use instanceof for some bizarre reason
            return foo.href;
        if (typeof foo === "string")
            return foo;
        return foo.toString();  // Last chance try and convert to a string based on a method of the object (could check for its existence)
    } catch (err) {
        throw new errors.CodingError(`Unable to turn ${foo} into a string ${err.message}`)
    }
};

utils.p_timeout = function(promise, ms, errorstr) {
    /* In a certain period, timeout and reject
    promise:    A promise we want to watch to completion
    ms:         Time in milliseconds to allow it to run
    errorstr:   Error message in reject error
    throws:     TimeoutError on timeout with message = errorstr
     */
    let timer = null;

    return Promise.race([
        new Promise((resolve, reject) => {
            timer = setTimeout(reject, ms, new errors.TimeoutError(errorstr || `Timed out in ${ms}ms`));
        }),
        promise.then((value) => {
            clearTimeout(timer);
            return value;
        })
    ]);
}

utils.createElement = function(tag, attrs, children) {        // Note arguments is set to tag, attrs, child1, child2 etc
    // Note identical version in dweb-transport/js/utils.js and dweb-transports/utils.js and dweb-objects/utils.js
    var element = document.createElement(tag);
    for (let name in attrs) {
        let attrname = (name.toLowerCase() === "classname" ? "class" : name);
        if (name === "dangerouslySetInnerHTML") {
            element.innerHTML = attrs[name]["__html"];
            delete attrs.dangerouslySetInnerHTML;
        }
        if (attrs.hasOwnProperty(name)) {
            let value = attrs[name];
            if (value === true) {
                element.setAttribute(attrname, name);
            } else if (typeof value === "object" && !Array.isArray(value)) {
                if (["style"].includes(attrname)) {  // e.g. style: {fontSize: "124px"}
                    for (let k in value) {
                        element[attrname][k] = value[k];
                    }
                } else {
                    // Assume we are really trying to set the value to an object, allow it
                    element[attrname] = value;  // Wont let us use setAttribute(attrname, value) unclear if because unknow attribute or object
                }
            } else if (value !== false && value != null) {
                element.setAttribute(attrname, value.toString());
            }
        }
    }
    for (let i = 2; i < arguments.length; i++) { // Everything after attrs
        let child = arguments[i];
        if (!child) {
        } else if (Array.isArray(child)) {
            child.map((c) => element.appendChild(c.nodeType == null ?
                document.createTextNode(c.toString()) : c))
        }
        else {
            element.appendChild(
                child.nodeType == null ?
                    document.createTextNode(child.toString()) : child);
        }
    }
    return element;
}


exports = module.exports = utils;

/**
 * A package of functions to support handling events
 * There are some similar packages on NPM including
 * https://github.com/mrdoob/eventdispatcher.js/blob/master/src/EventDispatcher.js
 * https://github.com/ShareIt-project/EventTarget.js/blob/master/EventTarget.js << implements some parts I'm missing
 * https://www.npmjs.com/package/js-eventtarget << only works as "extends EventTarget"
 * https://www.npmjs.com/package/@jsantell/event-target << only works as extends EventTarget
 * https://www.npmjs.com/package/oo-eventtarget << is a Mixin, github repo has vanished
 * - something like this probably exists on npm but I have not found it yet!
 *
 * See MDN's event handler docs esp
 * https://developer.mozilla.org/en-US/docs/Web/API/EventTarget for the pattern
 * See https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent
 * which is loosly implemented - i.e. changes may be made here align but dont implement all of it
 * Current Limitations:
 * - it only supports listeners as callback functions for now.
 * - it doesnt support options to addEventListener
 * - it doesnt support EventListener as object passed to addEventListner
 * Usage:
 *  EventTarget = require('./eventtarget.js')
 *  # import { createEventTarget } from './eventtarget.js' should also work
 *  class Foo {
 *    constructor() { createEventTarget(this); }
 *  }
 *  foo = new Foo()
 *  function f(event) { EventTarget.call(this); }
 *  foo.addEventListener("somethinghappened", f);
 *  foo.dispatch(new CustomEvent("somethinghappened", {detail: "What happened"}); // Works in browser
 *  foo.dispatch({type: "somethinghappened", detail: "What happened"}); // Works in node or browser
 *  foo.removeEventListener("somethinghappened", f);
 *
 *  TODO - add options to addEventListener that match https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener especially "once"
 *  TODO - wrap event dispatches in Exceptions, report as unhandled but dont propogate to caller (events should always handle their own exceptions)
 */

/**
 * create and initialize an object as an eventTarget
 * after calling this, the object has addEventListenet, removeEventListener and dispatchEvent functions.
 */
function EventTarget() {
  if (!this._listeners) {
    this._listeners = [];
    this.addEventListener = addEventListener.bind(this);
    this.removeEventListener = removeEventListener.bind(this);
    this.dispatchEvent = dispatchEvent.bind(this);
    // Note targets that want to be EventListeners should implment handleEvent itself
  }
}

/**
 * Add
 * @param type
 * @param callback f(Event)
 * TODO in future will handle EventListener as well as callback
 * TODO in future will handle options
 * TODO figure out "preventDefault" and if it makes any sense here since not in the DOM
 * See https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
 */
function addEventListener(type, callback) {
  if (type) {
    if (!(type in this._listeners)) this._listeners[type] = [];
    this._listeners[type].push(callback);
  }
}

/**
 * Remove a previously added eventListener (not an error if we cant find it)
 * @param type string
 * @param callback as supplied to addEventListener
 */
function removeEventListener(type, callback) {
  const stack = this._listeners[type];
  if (stack) {
    for (let i = 0, l = stack.length; i < l; i++) {
      if (stack[i] === callback) {
        stack.splice(i, 1);
        return;
      }
    }
  }
}

/**
 * Dispatch an event
 * @param event {type: string, detail: any}
 * @returns {boolean}
 */
function dispatchEvent(event) {
  const stack = this._listeners[event.type];
  if (stack) {
    //console.log("THIS=", this, "event.target=", event.target);
    //event.target = this;   //https://developer.mozilla.org/en-US/docs/Web/API/EventTarget but fails because target is readonly, with no apparent way to set it
    stack.forEach( listener => {
        listener(event); // ignore return, exceptions MUST be handled by listener, or will trigger unhandledException
      });
  }
  //return !event.defaultPrevented; // Not implemented - event would have to call defaultPrevented
}

exports = module.exports = EventTarget;
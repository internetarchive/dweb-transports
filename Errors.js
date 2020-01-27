// Use this when the code logic has been broken - e.g. something is called with an undefined parameter, its preferable to console.assert
// Typically this is an error, that should have been caught higher up.
class CodingError extends Error {
  constructor(message) {
    super(message || 'Coding Error');
    this.name = 'CodingError';
  }
}
// These are equivalent of python exceptions, will log and raise alert in most cases - exceptions aren't caught
class ToBeImplementedError extends Error {
  constructor(message) {
    super('To be implemented: ' + message);
    this.name = 'ToBeImplementedError';
  }
}

class TransportError extends Error {
  constructor(message, opts = {}) {
    super(message || 'Transport failure');
    this.name = 'TransportError';
    Object.assign(this, opts); // Allow passing back esp status
  }
}

class TimeoutError extends Error {
  constructor(message) {
    super(message || 'Timed out');
    this.name = 'TimeoutError';
  }
}

class IntentionallyUnimplementedError extends Error {
  constructor(message) {
    super(message || 'Intentionally Unimplemented Function');
    this.name = 'IntentionallyUnimplementedError';
  }
}
exports = module.exports = { CodingError, ToBeImplementedError, TransportError, TimeoutError, IntentionallyUnimplementedError };

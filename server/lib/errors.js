function httpError(status, publicMessage) {
  const error = new Error(publicMessage || 'Error');
  error.status = status;
  error.publicMessage = publicMessage || 'Error';
  return error;
}

function wrapAsync(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  httpError,
  wrapAsync,
};

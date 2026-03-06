const ERROR_MAP = {
  'M_FORBIDDEN': 'Wrong username or password.',
  'M_USER_IN_USE': 'That username is already taken.',
  'M_INVALID_USERNAME': 'Username can only contain letters, numbers, dots, hyphens and underscores.',
  'M_EXCLUSIVE': 'That username is reserved.',
  'M_GUEST_ACCESS_FORBIDDEN': 'You need an account to do that.',
  'M_MISSING_TOKEN': 'You\'ve been signed out. Please log in again.',
  'M_UNKNOWN_TOKEN': 'Your session expired. Please log in again.',

  'M_NOT_FOUND': 'That room couldn\'t be found.',
  'M_ROOM_IN_USE': 'A room with that address already exists.',
  'M_INVALID_ROOM_STATE': 'The room is in an invalid state.',
  'M_CANNOT_LEAVE_SERVER_NOTICE': 'You can\'t leave server notice rooms.',

  'M_LIMIT_EXCEEDED': 'You\'re sending messages too fast. Slow down a little.',

  'M_UNRECOGNIZED': 'The server didn\'t understand that request.',
  'M_BAD_STATE': 'That action isn\'t allowed right now.',

  'ECONNREFUSED': 'Couldn\'t connect to the server. Is it online?',
  'ENOTFOUND': 'Couldn\'t find that server. Check the address.',
  'ETIMEDOUT': 'Connection timed out. The server might be slow or offline.',

  'M_TOO_LARGE': 'That file is too large to send in this room.',
  'M_CANNOT_LEAVE': 'You can\'t leave this room right now.',

  'M_BAD_JSON': 'There was a problem with the message format.',
  'MEGOLM_NOT_READY': 'Encryption isn\'t ready yet. Try again in a moment.',

  'M_UNKNOWN': 'Something went wrong on the server.',
};

export function friendlyError(err) {
  if (!err) return 'An unknown error occurred.';

  if (err.errcode) {
    const mapped = ERROR_MAP[err.errcode];
    if (mapped) return mapped;
  }

  if (err.httpStatus) {
    if (err.httpStatus === 401) return 'You\'re not authorised to do that. Try logging in again.';
    if (err.httpStatus === 403) return 'You don\'t have permission to do that.';
    if (err.httpStatus === 404) return 'That resource wasn\'t found on the server.';
    if (err.httpStatus === 413) return 'The file or message is too large to send.';
    if (err.httpStatus === 429) return 'You\'re being rate limited. Wait a moment and try again.';
    if (err.httpStatus >= 500) return 'The server hit an error. Try again in a moment.';
  }

  const msg = err.message ?? String(err);
  if (msg.includes('ECONNREFUSED')) return ERROR_MAP['ECONNREFUSED'];
  if (msg.includes('ENOTFOUND')) return ERROR_MAP['ENOTFOUND'];
  if (msg.includes('ETIMEDOUT')) return ERROR_MAP['ETIMEDOUT'];
  if (msg.includes('Failed to fetch')) return 'Couldn\'t reach the server. Check your internet connection.';
  if (msg.includes('NetworkError')) return 'A network error occurred. Check your connection.';

  if (msg && msg.length < 120 && !msg.includes('at ')) return msg;

  return 'Something went wrong. Please try again.';
}

export async function tryCatch(fn, onError) {
  try {
    return await fn();
  } catch (err) {
    const msg = friendlyError(err);
    if (onError) onError(msg);
    return null;
  }
}

export const IS_LOCAL = ['localhost', '127.0.0.1', ''].includes(location.hostname);
// Upper limits for typed numbers, so a slip of the finger cannot create an impossible amount
// (and every total stays far inside the range where JavaScript numbers are exact to the paisa)
export const MAX_PRICE = 1000000;
export const MAX_QTY = 100000;
export const MAX_AMOUNT = 10000000;

// Google sign-in for Drive backups (OAuth "Web application" client ID from Google Cloud Console).
// Public by design: it only identifies this app; each shop owner signs in with their own Google
// account and backups go to their own Drive. Empty = Drive backup is not set up yet
export const GOOGLE_CLIENT_ID = '';

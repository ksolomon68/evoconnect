// Native Netlify Functions provide the Blobs environment, including strong reads.
import handler from '../../server/netlify-handler.js';
export default request => handler.handleRequest(request);

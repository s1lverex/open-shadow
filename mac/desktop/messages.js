'use strict';

// The chat keeps its history in the Chat Completions shape; this holds the small pieces every adapter shares.
const NO_VISION = '[A picture was here, but the selected model can\'t see pictures]';

const text = content => typeof content === 'string' ? content : (content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');

// Content parts in the target API's shape: 'chat' keeps image_url, 'responses' uses input_text/input_image.
function parts(content, vision, kind = 'chat') {
 const label = kind === 'responses' ? 'input_text' : 'text';
 if (typeof content === 'string') return [{ type: label, text: content }];
 return (content || []).map(part => part.type !== 'image_url' ? { type: label, text: part.text || '' }
  : !vision ? { type: label, text: NO_VISION }
  : kind === 'responses' ? { type: 'input_image', image_url: part.image_url.url, detail: 'auto' }
  : { type: 'image_url', image_url: { url: part.image_url.url } });
}

module.exports = { NO_VISION, text, parts };


const sharp = require('sharp');
sharp('logo.png').metadata().then(m => {
  console.log('Width:', m.width, 'x Height:', m.height);
  console.log('Format:', m.format);
}).catch(e => console.error(e));

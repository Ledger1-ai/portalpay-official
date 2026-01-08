
const sharp = require('sharp');
const path = require('path');

const input = path.join(process.cwd(), 'public', 'bsurgebg.png');
const output = path.join(process.cwd(), 'public', 'bsurgebg-blurred.png');

sharp(input)
    .resize(2400, 1260) // Ensure size
    .blur(20) // Moderate blur - 40 might be too slow or too washed out, let's try 20-30. User asked for preblurred.
    .toFile(output)
    .then(() => console.log('Generated bsurgebg-blurred.png'))
    .catch(err => console.error(err));

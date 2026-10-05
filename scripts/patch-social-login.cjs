const fs = require('fs');
const path = require('path');

const targetFile = path.join(
  __dirname,
  '../node_modules/@capgo/capacitor-social-login/android/src/main/java/ee/forgr/capacitor/social/login/GoogleProvider.java'
);

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');
  if (content.includes('AuthorizationResult authResult = future.get();')) {
    content = content.replace(
      'AuthorizationResult authResult = future.get();',
      'AuthorizationResult authResult = future.get(4, TimeUnit.SECONDS);'
    );
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('[patch-social-login] Patched GoogleProvider.java future.get with 4s timeout.');
  }
}

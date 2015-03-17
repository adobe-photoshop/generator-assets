echo Updating npm-shrinkwrap.json
rm -rf node_modules
rm -rf npm-shrinkwrap.json
npm cache clear
npm install --production
npm shrinkwrap

echo Updating npm-shrinkwrap.json
rm -rf node_modules
rm -rf npm-shrinkwrap.json
npm clear cache
npm install --production
npm shrinkwrap

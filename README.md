https://github.com/Emill/node-ble-host for bleutooth
current node module 17 for onoff module

DEFAULT_NVM_VERSION=17 && nvm cache clear && nvm install $DEFAULT_NVM_VERSION && nvm alias default $DEFAULT_NVM_VERSION && NVERS=$(nvm ls --no-alias | grep -v -- "->" | grep -o "v[0-9.]*") && while read ver; do nvm uninstall $ver; done <<< $NVERS && while read ver; do nvm install $ver; done <<< $NVERS && nvm use $DEFAULT_NVM_VERSION


If you have tried everything still no luck you can try this :_

1 -> Uninstall NVM

rm -rf ~/.nvm
2 -> Remove npm dependencies by following this

3 -> Install NVM

curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash
4 -> Set ~/.bash_profile configuration

Run sudo nano ~/.bash_profile

Copy and paste following this

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
5 -> CONTROL + X save the changes

6 -> Run . ~/.bash_profile

7 -> Now you should have nvm installed on your machine, to install node run nvm install v7.8.0 this will be default node version or you can install any version of node

Share
Improve this answer


https://github.com/nvm-sh/nvm#install-script

sudo setcap cap_net_admin=ep $(eval readlink -f `which node`)

npm run build:webpack:dev;
echo '{ "main": "dist/main-exe.js", "output": "sea-prep.blob" }' > sea-config.json;
npm run build-exe;
node --experimental-sea-config sea-config.json;
cp $(command -v node) server;
npx postject server NODE_SEA_BLOB sea-prep.blob     --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2;

node-sea -e main-exe.js -o main-exe
node-sea -e main-exe.js -o main-exe -n -a armv7

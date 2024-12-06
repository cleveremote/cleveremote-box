# CLV-BOX

![](hydrophyto.svg)

 ![](https://img.shields.io/github/stars/pandao/editor.md.svg) ![](https://img.shields.io/github/forks/pandao/editor.md.svg) ![](https://img.shields.io/github/tag/pandao/editor.md.svg) ![](https://img.shields.io/github/release/pandao/editor.md.svg) ![](https://img.shields.io/github/issues/pandao/editor.md.svg) ![](https://img.shields.io/bower/v/editor.md.svg)

### Description

- Irrigation's control based on simple to complexe scenarios, includind sensors values as input.

**Table of Contents**

[TOC]

# Project setup
## Installation/Configuration prerequisites

### AWS
 - **Installation**
 
 ```shell
sudo apt-get update && sudo apt-get upgrade
```
```shell
sudo apt install awscli
```

- **configuration**
  - prepare your credentials as (admin) AWS, downloaded previously
 ```shell
aws configure
```
 - login aws cli
 ```shell
aws ecr get-login-password --region eu-west-3 | docker login --username AWS --password-stdin 182399677959.dkr.ecr.eu-west-3.amazonaws.com
```

### docker
 - **installation**
 ```shell
sudo apt-get update && sudo apt-get upgrade
```
```shell
curl -fsSL https://get.docker.com -o get-docker.sh
```
```shell
sudo sh get-docker.sh
```
```shell
sudo usermod -aG docker pi
```
```shell
sudo chmod 666 /var/run/docker.sock
```

- **Actions**
```shell
    docker build --progress=plain --no-cache -t xxxxxx.dkr.ecr.eu-west-3.amazonaws.com/cleveremote/clv-box:v1.x.x -t xxxxxxx.dkr.ecr.eu-west-3.amazonaws.com/cleveremote/clv-box:latest
```
  prerequisites login aws cli with at least with pull autorisiations
```shell
    docker run -d --name clever-box --net=host --privileged --restart unless-stopped -t cleveremote/clever-box:latest
```
```shell
    docker pull 182399677959.dkr.ecr.eu-west-3.amazonaws.com/cleveremote/clv-box:latest
```

### node
- **installation**
 ```shell
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
```
```shell
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
```
```shell
nvm install 20
```
```shell
nvm alias default 20
```

### git
- **installation**
 ```shell
sudo apt update
```
```shell
sudo apt install git
```
- **configuration**
 ```shell
git config --global user.name Nadime
```
```shell
git config --global user.email cleveremote-tech@gmail.com
```
```shell
git clone https://github.com/cleveremote/cleveremote-box.git
```
- [Create self hosted runner](http://https://github.com/cleveremote/cleveremote-box/settings/actions/runners/new?arch=arm64&os=linux "create self hosted runner") follow steps
- [Execute self hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/configuring-the-self-hosted-runner-application-as-a-service "Execute self hosted runner") follow steps

## Launch App

### Set bluetooth capabilities
```shell
sudo setcap cap_net_admin=ep $(eval readlink -f `which node`)
```
### Exec Mode
```shell
npm run start:dev
```
### Debug Mode (vscode)
- prerequisites
create file in workspace project **.vscode/launch.json**
```javascript
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "node",
            "request": "attach",
            "name": "Attach sales-api",
            "address": "127.0.0.1",
            "port": 5200,
            "remoteRoot": "${workspaceRoot}/dist",
            "localRoot":"${workspaceRoot}/dist",
            "outFiles":["${workspaceRoot}/dist/**/*.js"],
            "sourceMaps": true,
            "protocol": "inspector",
            "restart": true,
            "trace": true
        }
    ]
}
```
```shell
npm run start:debug
```
### Exec test
```shell
npm run test:e2e
```
### miscellaneous
- **stop all images & Remove all unused containers**
 ```shell
 docker stop $(docker ps -a -q)
 docker system prune --all --force
```
- **access the container**
```shell
docker run -it --entrypoint /bin/bash clever-box
```
- **get device serial**
```shell
cat /proc/cpuinfo | grep Serial | cut -d ' ' -f 2
```
- **get commands line history**
```shell
cat ~/.bash_history
```

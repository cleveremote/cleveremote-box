# CLV-BOX

![](https://pandao.github.io/editor.md/images/logos/editormd-logo-180x180.png)

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
## Launch App
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

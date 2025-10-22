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
    docker run -v /etc/wpa_supplicant:/etc/wpa_supplicant:rw -d --name clever-box --net=host --privileged --restart unless-stopped -t cleveremote/clever-box:latest
```
```shell
    docker pull 182399677959.dkr.ecr.eu-west-3.amazonaws.com/cleveremote/clv-box:latest
```
- mapping folder so that container can access local device folder/file...
```shell
    docker run -v external_path:path_in_the_container:rw -it --entrypoint /bin/bash clever-box
    docker run -it --entrypoint /bin/bash clever-box
```
 docker run -d -e SOCKET_SERVER="http://ec2-35-180-231-37.eu-west-3.compute.amazonaws.com:5001" -v /home/clv/udi:/home/clv/udi:ro -v /sys/kernel/debug/:/sys/kernel/debug/:rw -v /sys/class/gpio/:/sys/class/gpio/:rw --name clv-box --net=host --privileged -v /var/run/dbus:/var/run/dbus:rw clv-box

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

- **Actions**

```shell
git tag v1.0.0
```
```shell
git push origin  main --tags
```

## configure permission for networkmanager so that app can manage wifi whith clv user.
- edit file and  add the content below
```shell
sudo nano /etc/polkit-1/localauthority/90-mandatory.d/99-network.pkla
```

```shell
[Allow netdev users to modify all network states and settings]
Identity=unix-group:clv
Action=org.freedesktop.NetworkManager.network-control;org.freedesktop.NetworkManager.enable-disable-wifi;org.freedesktop.NetworkManager.settings.modify.system;org.freedesktop.NetworkManager.wifi.scan // Action=org.freedesktop.NetworkManager.* full right
ResultAny=yes
ResultInactive=yes
ResultActive=yes
````

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

- kill process using specific port if not exisis "sudo apt install lsof"

```shell
 kill -9 $(lsof -ti:8081)
```
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
- **remove all images except latest tag**
```shell
docker rmi -f $(docker images --format "{{.ID}}" |  grep -v $(docker images --format "{{.ID}}" --filter "reference=*/cleveremote/clv-box:*latest" ))
```
- **remove all containers with exited status**
```shell
docker rm -v $(docker ps --filter status=exited -q)
```

## Install runners
- go to your repository (in github) => settings => actions (on side menu) => runners => + add new runner.
- select yout os & arch then follow the steps.
- if multi runners in the same machi exampe multiple embaded apps in the same device then think to create different specific folder for each project.
- install runner as service on the machine
```shell
 sudo ./svc.sh install
 sudo ./svc.sh start
 ```
- Stop runner
```shell
sudo ./svc.sh stop
 ```
- Remove runner service
 ```shell
sudo ./svc.sh uninstall
 ```

 ## troubleshooting

- when linking libs for musldev docker file sometimes new version of musl-dev update the name of lib be aware to modify this line in the docker file **"RUN ln -s /usr/lib/aarch64-linux-musl/libc.so /lib/libc.musl-aarch64.so.1"** and put the right path/file of the lib.
example of the error
``` shell
/node_modules/bindings/bindings.js:121
        throw e;
        ^

Error: libc.musl-aarch64.so.1: cannot open shared object file: No such file or directory
    …
 {
  code: 'ERR_DLOPEN_FAILED'
}
```

problem docker alpine upgrade make some copilation package issues
 fix the working version in dockerfile .
 check the alpine relase note 

 problème 1
* cas de changement de sd vers une autre rsb problème de clé ssh
    *  supprimer la ligne correspondante à l’adresse ip
    * refaire la manipulation d’authentification ssh
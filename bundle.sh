#! /bin/bash

if [ -z "$1" ]; then
    echo "specify a destination folder"
else
    pushd `pwd`
    mkdir -p $1/Plug-ins/Generator/generator-assets
    git archive -o $1/Plug-ins/Generator/generator-assets/generator-assets.tar HEAD
    cd $1/Plug-ins/Generator/generator-assets
    tar -xvf generator-assets.tar
    rm generator-assets.tar
    npm install --production
    cd $1
    zip -r generator-assets-`date "+%Y-%m-%d-%H-%M-%S"`.zip Plug-ins
    rm -rf Plug-ins
    popd
fi

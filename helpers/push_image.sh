#!/bin/bash

# Vérifie si le premier paramètre est fourni
if [ -z "$1" ]; then
  echo "Erreur : veuillez  specifier la version destination"
  echo "Usage : $0 <param1>"
  exit 1
fi

# Affecte une valeur par défaut au deuxième paramètre s'il n'est pas fourni
param1="$1"
param2="${2:-latest}"

# Concatène les deux paramètres
result="${param1}${param2}"

# Affiche le résultat
echo "Résultat de la concaténation : $result"


docker build -t cleveremote/clv-box:${param1} -t cleveremote/clv-box:${param2} .
docker tag cleveremote/clv-box:${param1} 182399677959.dkr.ecr.eu-west-3.amazonaws.com/cleveremote/clv-box:${param1}
docker tag cleveremote/clv-box:${param2} 182399677959.dkr.ecr.eu-west-3.amazonaws.com/cleveremote/clv-box:${param2}
docker push 182399677959.dkr.ecr.eu-west-3.amazonaws.com/cleveremote/clv-box --all-tags

echo "success"
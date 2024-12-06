#!/bin/bash

docker pull 182399677959.dkr.ecr.eu-west-3.amazonaws.com/cleveremote/clv-box:latest
docker pull 182399677959.dkr.ecr.eu-west-3.amazonaws.com/cleveremote/clv-router:latest

# List of image IDs
image_ids=$(docker images --format "{{.ID}}" |  grep -v -E $(docker images --format "{{.ID}}" --filter "reference=*/cleveremote/clv-*:*latest" | sort -u | paste -sd '|') | sort -u )
# Loop through each image ID
 if [ -n "$image_ids" ]; then
  
for image_id in "${image_ids[@]}"; do
  # Get container IDs associated with the image
  container_ids=$(docker ps -a --filter "ancestor=$image_id" -q)

  # Delete the containers
  if [ -n "$container_ids" ]; then
    docker rm -f $container_ids
    echo "Deleted containers for image: $image_id"
  else
    echo "No containers found for image: $image_id"
  fi
done

docker rmi -f image_ids
fi

if [ -n "$(docker ps --filter status=exited -q)" ]; then
    docker rm -v $(docker ps --filter status=exited -q)
fi

if ! docker ps --format '{{.Names}}' | grep -w clv-box &> /dev/null; then
    docker run -d --name clv-box --net=host --privileged --restart unless-stopped 182399677959.dkr.ecr.eu-west-3.amazonaws.com/cleveremote/clv-box:latest
fi

if ! docker ps --format '{{.Names}}' | grep -w clv-router &> /dev/null; then
    docker run --name clv-router -d -p5001:5001 182399677959.dkr.ecr.eu-west-3.amazonaws.com/cleveremote/clv-router:latest
fi

#!/usr/bin/env bash
# Create or update the Couch Game Studio stack (EC2 behind CloudFront) and print its HTTPS address.
#   infra/aws/deploy.sh                 # region from AWS_REGION or your profile
#   GIT_REF=v1.1.0 infra/aws/deploy.sh  # run a specific tag
set -euo pipefail
cd "$(dirname "$0")"

STACK=${STACK:-couch-game-studio}
REGION=${AWS_REGION:-$(aws configure get region)}
GIT_REF=${GIT_REF:-main}
export AWS_REGION=$REGION

VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
PL=$(aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)
[[ $VPC == vpc-* && $PL == pl-* ]] || { echo "Could not find the default VPC or the CloudFront prefix list in $REGION." >&2; exit 1; }

echo "Deploying $STACK to $REGION (git ref $GIT_REF). The first deploy takes about 10 minutes."
aws cloudformation deploy --stack-name "$STACK" --template-file studio.yaml --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides VpcId="$VPC" CloudFrontPrefixListId="$PL" GitRef="$GIT_REF" \
  --tags project=couch-game-studio

aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table

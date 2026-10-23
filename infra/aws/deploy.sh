#!/usr/bin/env bash
# Create or update the Couch Game Studio stack (EC2 + Caddy HTTPS) and print its HTTPS address.
#   infra/aws/deploy.sh                    # region from AWS_REGION or your profile
#   GIT_REF=v1.1.0 infra/aws/deploy.sh     # run a specific tag (new stacks)
#   ALLOW_REPLACE=1 infra/aws/deploy.sh    # allow replacing the server (empties the arcade)
#
# Updates go through a change set that is shown first. If it would replace the server (a changed
# boot script or a newer Amazon Linux image), the deploy stops: games live on the server's disk.
# Ship code with infra/aws/update.sh instead.
set -euo pipefail
cd "$(dirname "$0")"

STACK=${STACK:-couch-game-studio}
REGION=${AWS_REGION:-$(aws configure get region)}
GIT_REF=${GIT_REF:-main}
export AWS_REGION=$REGION

VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
[[ $VPC == vpc-* ]] || { echo "Could not find the default VPC in $REGION." >&2; exit 1; }

if aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; then
  TYPE=UPDATE
  # Keep the running server's image and settings unless they are deliberately changed.
  PARAMS=(ParameterKey=VpcId,ParameterValue="$VPC")
  for k in GitRef InstanceType ImageId LlmProvider BedrockDailyLimit; do PARAMS+=("ParameterKey=$k,UsePreviousValue=true"); done
else
  TYPE=CREATE
  PARAMS=(ParameterKey=VpcId,ParameterValue="$VPC" ParameterKey=GitRef,ParameterValue="$GIT_REF")
fi

CS="deploy-$(date +%Y%m%d-%H%M%S)"
echo "Preparing $TYPE of $STACK in $REGION…"
aws cloudformation create-change-set --stack-name "$STACK" --change-set-name "$CS" --change-set-type "$TYPE" \
  --template-body file://studio.yaml --capabilities CAPABILITY_IAM --parameters "${PARAMS[@]}" \
  --tags Key=project,Value=couch-game-studio >/dev/null
if ! aws cloudformation wait change-set-create-complete --stack-name "$STACK" --change-set-name "$CS" 2>/dev/null; then
  REASON=$(aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "$CS" --query StatusReason --output text)
  aws cloudformation delete-change-set --stack-name "$STACK" --change-set-name "$CS" >/dev/null 2>&1 || true
  [[ $REASON == *"didn't contain changes"* ]] && { echo "Nothing to change."; exit 0; }
  echo "Change set failed: $REASON" >&2; exit 1
fi

aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "$CS" \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,Replacement]' --output table
REPLACES=$(aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "$CS" \
  --query "Changes[?ResourceChange.LogicalResourceId=='Instance' && ResourceChange.Replacement!='False'] | length(@)" --output text)
if [[ $TYPE == UPDATE && $REPLACES != 0 && ${ALLOW_REPLACE:-} != 1 ]]; then
  aws cloudformation delete-change-set --stack-name "$STACK" --change-set-name "$CS" >/dev/null
  echo "Stopped: this update could replace the server, which empties the arcade. Re-run with ALLOW_REPLACE=1 to go ahead." >&2
  exit 1
fi

aws cloudformation execute-change-set --stack-name "$STACK" --change-set-name "$CS"
echo "Applying (a new stack takes about 10 minutes)…"
if [[ $TYPE == CREATE ]]; then aws cloudformation wait stack-create-complete --stack-name "$STACK"
else aws cloudformation wait stack-update-complete --stack-name "$STACK"; fi

aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table

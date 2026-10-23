#!/usr/bin/env bash
# Ship new code to the running studio without replacing the server (keeps every game made so far).
#   infra/aws/update.sh          # latest main
#   infra/aws/update.sh v1.1.0   # a branch or tag
set -euo pipefail
STACK=${STACK:-couch-game-studio}
REF=${1:-main}
[[ $REF =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "Bad ref: $REF" >&2; exit 1; }
export AWS_REGION=${AWS_REGION:-$(aws configure get region)}

ID=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text)
CMD=$(aws ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript --comment "cgs-update $REF" \
  --parameters "commands=[\"/usr/local/bin/cgs-update '$REF'\"]" --query Command.CommandId --output text)
echo "Updating $ID to $REF…"
aws ssm wait command-executed --command-id "$CMD" --instance-id "$ID" || true
aws ssm get-command-invocation --command-id "$CMD" --instance-id "$ID" \
  --query '[Status,StandardOutputContent,StandardErrorContent]' --output text

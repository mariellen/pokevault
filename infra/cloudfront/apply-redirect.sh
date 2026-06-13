#!/usr/bin/env bash
# apply-redirect.sh — create/publish the redirect-refactor CloudFront Function
# and associate it as a viewer-request handler on distribution E2IMCPUABUXY1Y,
# then invalidate /*.
#
# REQUIRES ELEVATED CREDENTIALS. The default `pokevault-deploy` IAM user only
# has s3:* on the bucket + cloudfront:CreateInvalidation — it CANNOT create/
# publish/associate functions or update the distribution. Run this with an
# admin/infra profile:  AWS_PROFILE=pokevault-admin ./apply-redirect.sh
#
# Order of operations (Opus): apply + verify the redirect BEFORE deleting any
# S3 files, so users hitting the old URL during propagation get a clean 301.
set -euo pipefail

DIST_ID="E2IMCPUABUXY1Y"
FN_NAME="redirect-refactor"
FN_FILE="$(dirname "$0")/redirect-refactor.js"

echo "==> Creating function ${FN_NAME} from ${FN_FILE}"
ETAG=$(aws cloudfront create-function \
  --name "${FN_NAME}" \
  --function-config "Comment=Redirect /pokevault-refactor/* to site root,Runtime=cloudfront-js-2.0" \
  --function-code "fileb://${FN_FILE}" \
  --query 'ETag' --output text)
echo "    created, ETag=${ETAG}"

echo "==> Publishing function"
aws cloudfront publish-function --name "${FN_NAME}" --if-match "${ETAG}"

FN_ARN=$(aws cloudfront describe-function --name "${FN_NAME}" \
  --query 'FunctionSummary.FunctionMetadata.FunctionARN' --output text)
echo "    published, ARN=${FN_ARN}"

cat <<EOF

==> NEXT (manual, requires distribution update):
    Associate ${FN_ARN} as a viewer-request FunctionAssociation on the
    DefaultCacheBehavior of distribution ${DIST_ID}, then:

      aws cloudfront create-invalidation --distribution-id ${DIST_ID} --paths "/*"

    Distribution-config edits are deliberately left manual/reviewed — see
    README.md. Do NOT proceed to delete S3 files until verify-gates.sh
    confirms the 301 is live (gates 1-4).
EOF

#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🧪 Running Email Sorter Tests${NC}"
echo ""

# Unit tests for Gmail package
echo -e "${YELLOW}Running Gmail parser tests...${NC}"
pnpm --filter gmail test

if [ $? -ne 0 ]; then
    echo "Gmail tests failed!"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ All tests passed!${NC}"

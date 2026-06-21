#!/bin/bash

# Test script for audience-qna-webapp project
# This script runs tests for all services

set -e

echo "================================"
echo "Audience Q&A Webapp - Test Suite"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if node_modules exist, install if needed
echo -e "${YELLOW}Checking dependencies...${NC}"

if [ ! -d "services/question-service/node_modules" ]; then
  echo "Installing question-service dependencies..."
  cd services/question-service
  npm install
  cd ../../
fi

if [ ! -d "services/vote-service/node_modules" ]; then
  echo "Installing vote-service dependencies..."
  cd services/vote-service
  npm install
  cd ../../
fi

echo ""
echo -e "${YELLOW}Running Question Service Tests...${NC}"
cd services/question-service
npm test 2>&1 || EXIT_CODE=$?
cd ../../

echo ""
echo -e "${YELLOW}Running Vote Service Tests...${NC}"
cd services/vote-service
npm test 2>&1 || EXIT_CODE=$?
cd ../../

echo ""
if [ -z "$EXIT_CODE" ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi

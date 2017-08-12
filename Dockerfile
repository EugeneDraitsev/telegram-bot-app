FROM node:latest

RUN yarn global add serverless && \
    yarn global add aws-cli

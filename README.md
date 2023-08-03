# Sample Civo Pulumi Project

## Pre-requistists

- NodeJS Installed to a Supported Version (Latest or LTS version)
- Pulumi CLI (https://www.pulumi.com/docs/install/)
  - Download and unpack the CLI before adding it's location to the path

## Create Project

You can use the pulumi CLI to create a project skeleton, from within a new project directory: `pulumi new typescript`

You will be prompted for an access token, if you paste it, it won't show.

You will then be asked for a cloud destination: <org>/<stack> or <stack>, rhe org must exist first.
    
A `tsconfig.json` is optional

## Install Dependancies

You need t: `npm install @pulumi/<package>`
Example: `npm install @pulumi/kubernetes` & `npm install @pulumi/civo`

## Secrets

`pulumi config set civo:token --secret <YOUR_API_KEY_FROM_CIVO_PAGE>`, or you can pickup your CIVO Token from $CIVO_TOKEN

## Preview

`pulumi preview`

## Deploy

`pulumi up`

## Destroy

`pulumi destroy`

## Notes

Pulumi NodeJS will load by default: `index.js`/`index.ts`, but can be overridden by adding: `"main": "src/entry.ts"` to the package.json

Resources are declared within a module:

You can return a module object
```
// create resources
...
export const out = myResource.output;
```

Or alternatively, your entrypoint can export a top level `async` function that returns an object with members for each stack output.
Pulumi will automatically call this function and await the result:
```
export = async () => {
    // create resources
    return { out: myResource.output };
}
```

Pulumi automatically calls the 
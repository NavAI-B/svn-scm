# Contributing

Before you contribute to this project, please open an issue beforehand to discuss the changes you want to make.

## Development setup

Requirements
* [Git](https://git-scm.com/)
* [NodeJs](https://nodejs.org/) >= 20.0.0
* [yarn](https://classic.yarnpkg.com/lang/en/) >= 1.22 (optional, npm also works)

First you will need to fork the project
![Github Fork](images/docs/fork.png)

Then clone your fork
```
git clone https://github.com/<YOUR_USERNAME>/svn-scm.git
```

### Dependencies
To install all of the required dependencies run
```
yarn --frozen-lockfile
```
or with npm:
```
npm ci
```

### Build
To build the extension (TypeScript via webpack + SCSS)
```
yarn run build
```
or with npm:
```
npm run build
```
This runs `build:ts` (webpack production) and `build:css` (sass compilation) in sequence.

### Watch
For development run in watch mode
```
yarn run compile
```
or with npm:
```
npm run compile
```
This starts webpack in watch mode. To also watch SCSS changes:
```
yarn run watch:css
# or
npm run watch:css
```

### Formatting
This project uses [prettier](https://prettier.io/) for code formatting. You can run prettier across the code by calling:
```
yarn run style-fix
# or
npm run style-fix
```

### Linting
This project uses [ESLint](https://eslint.org/) for code linting. You can run ESLint across the code by calling:
```
yarn run lint
# or
npm run lint
```
To fix fixable errors:
```
yarn run lint:fix
# or
npm run lint:fix
```

### Testing
To compile and run tests:
```
yarn run test-compile
yarn test
```
or with npm:
```
npm run test-compile
npm test
```

### Debugging
Run in VS Code
1. Open the `svn-scm` folder
2. Make sure the [dependencies](#dependencies) are installed
3. Run in [watch](#watch) mode
4. Choose the `Launch Extension` launch configuration from the launch dropdown in the Debug viewlet and press `F5`.

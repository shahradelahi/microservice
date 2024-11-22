# CronStack

_cronstack_ is a versatile library for managing tasks, scheduling functions. It allows you to automate the execution of functions through triggers or scheduled intervals. The package includes powerful CLI tools for managing your tasks, transpiling code, and bundling resources.

## Installation

```bash
npm install cronstack
```

## CLI Options

```text
Usage: cronstack [options] [command]

Manage your services with CronStack.

Options:
  -v, --version                  display the version number
  -h, --help                     display help for command

Commands:
  add [options] <name>           Add a new service
  build [options]                Build all services
  dev [options] [services...]    Start services in development mode
  init [options]                 Initialize your project.
  start [options] [services...]  Start all services
  help [command]                 display help for command
```

### Directory Structure

For the service to be recognized, ensure your service file follows the pattern:

1. Directly under the `services` directory.

```text
+<name>.service.ts
```

2. Directory with name of the service under `services` directory.

```text
<name>/+service.ts
```

Notice that you can put the `services` directory in `src` as well.

###### Example

```text
project-root
|-- services
|   |-- +<name>.service.ts
|   |-- <name>
|       |-- +service.ts
```

## License

[MIT](LICENSE) © [Shahrad Elahi](https://github.com/shahradelahi)

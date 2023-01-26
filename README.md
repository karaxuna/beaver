## Debugging

Run node process remotely via nodemon:

```
nodemon --debug index.js
```

Attach to process from vscode debugger.

## Running

```
forever -o out.log -e err.log restart index.js
```
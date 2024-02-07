export type Domain = {
  name: string;
} & ({
  redirectTo: string;
} | {
  target: string;
});

export type ClientConfig = {
  env: any;
  domains: Domain[];
};

import { ClientConfig } from './types';

export const getTld = (config: ClientConfig) => {
  return config.env.TLD; // TODO: this is tmp solution
};

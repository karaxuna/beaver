export const wildcard = (str: string, pattern: string) => {
    // Escape special regex characters except * and .
    const escapedPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    
    // Convert wildcard pattern to regex:
    // - * becomes .* (matches anything within a segment)
    // - ** becomes .* (matches across segments)
    // - *. becomes [^.]*\. (matches any non-dots followed by a dot)
    const regexPattern = '^' + 
      escapedPattern
        .replace(/\*\./g, '[^.]*\\.')  // handle *. cases
        .replace(/\*\*/g, '.*')        // handle ** cases
        .replace(/\*/g, '[^.]*') +      // handle single * cases
      '$';
    
    const regex = new RegExp(regexPattern);
    return regex.test(str);
  }
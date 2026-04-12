import React from 'react';
import { createRoutesFromElements, Route, matchRoutes } from 'react-router-dom';

const routes = createRoutesFromElements(
  <Route path="/" element={null}>
    <Route path="content-library" element={null} />
    <Route path="content-library/batch-ops" element={null} />
  </Route>
);

const m = matchRoutes(routes, '/content-library/batch-ops');
console.log(
  m?.map((x) => ({
    routePath: x.route.path,
    pathname: x.pathname,
  }))
);

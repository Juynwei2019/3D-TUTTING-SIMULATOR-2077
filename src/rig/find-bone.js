function findBone(root, suffix){
  let found = null;
  root.traverse(o => { if (!found && o.isBone && o.name.endsWith(suffix)) found = o; });
  return found;
}


export { findBone };

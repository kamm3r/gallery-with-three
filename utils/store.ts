import create from 'zustand';

export const state = {
  top: 0,
  pages: 0,
  threshold: 2,
  mouse: [0, 0],
  content: [
    {
      images: [
        '/assets/text.jpg',
        '/assets/sweesh.jpg',
        '/assets/hands.jpg',
        '/assets/mankey.jpg',
        '/assets/oilpainting.jpg',
        '/assets/plaster.jpg',
        '/assets/tree.jpg',
        '/assets/fieldhouse.jpg',
        '/assets/pocket_monsters.jpg',
        // {
        //   id: 1,
        //   img: '/assets/text.jpg',
        //   title: 'text',
        //   description: 'lorem1',
        // },
        // {
        //   id: 2,
        //   img: '/assets/sweesh.jpg',
        //   title: 'text',
        //   description: 'lorem1',
        // },
        // {
        //   id: 3,
        //   img: '/assets/hands.jpg',
        //   title: 'text',
        //   description: 'lorem1',
        // },
        // {
        //   id: 4,
        //   img: '/assets/mankey.jpg',
        //   title: 'text',
        //   description: 'lorem1',
        // },
        // {
        //   id: 5,
        //   img: '/assets/oilpainting.jpg',
        //   title: 'text',
        //   description: 'lorem1',
        // },
        // {
        //   id: 6,
        //   img: '/assets/plaster.jpg',
        //   title: 'text',
        //   description: 'lorem1',
        // },
        // {
        //   id: 7,
        //   img: '/assets/tree.jpg',
        //   title: 'text',
        //   description: 'lorem1',
        // },
        // {
        //   id: 8,
        //   img: '/assets/fieldhouse.jpg',
        //   title: 'text',
        //   description: 'lorem1',
        // },
        // {
        //   id: 9,
        //   img: '/assets/pocket_monsters.jpg',
        //   title: 'text',
        //   description: 'lorem1',
        // },
      ],
    },
  ],
  trees: [
    '/assets/trees/tree-branched.glb',
    '/assets/trees/tree-columnar.glb',
    '/assets/trees/tree-conical.glb',
    '/assets/trees/tree-open.glb',
    '/assets/trees/tree-oval.glb',
    '/assets/trees/tree-pyramidal.glb',
    '/assets/trees/tree-round.glb',
    '/assets/trees/tree-spreading.glb',
    '/assets/trees/tree-vase.glb',
  ],
};

//zustand finite-state machine

type Store = {
  _states: any;

  _AddState: (name: string, type: any) => void;
  SetState: (name: string) => void;
  Update: (timeElapsed: number, input: any) => void;
};

const useStore = create<Store>((set) => ({
  _states: {},

  _AddState: (name, type) =>
    set((state) => {
      state._states[name] = type;
    }),

  SetState: (name) =>
    set((state) => {
      state._states[name];
    }),
  Update: (timeElapsed, input) =>
    set((state) => {
      state.Update(timeElapsed, input);
    }),
}));

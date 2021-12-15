import { useThree } from '@react-three/fiber';
import { Box } from '@react-three/flex';
import Texts from './text';

export const Description = () => {
  const { viewport } = useThree();

  return (
    <Box grow={2} shrink={1} basis={100} marginRight={1}>
      <Box>
        <Texts
          bold
          lineHeight={1.5}
          letterSpacing={-0.05}
          color='black'
          maxWidth={(viewport.width / 4) * 3}
          fontSize={1}
        >
          Nothing Written
        </Texts>
      </Box>
      <Box>
        <Texts
          italic
          lineHeight={1.5}
          letterSpacing={-0.05}
          color='#1f1f1f'
          maxWidth={(viewport.width / 25) * 3}
          fontSize={0.5}
        >
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Ullam facilis
          dignissimos sapiente eveniet! Adipisci voluptates eius quos rerum? In,
          repellat!
        </Texts>
      </Box>
    </Box>
  );
};

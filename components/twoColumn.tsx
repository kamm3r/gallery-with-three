import { Html, Text } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Box, Flex } from '@react-three/flex';
import { BigPainting } from './BigPainting';
import Texts from './text';

export const TwoColumn = () => {
  const { viewport } = useThree();

  return (
    <Flex
      dir='column'
      justify='center'
      align='center'
      position={[-viewport.width / 2, viewport.height / 2, 0]}
      size={[viewport.width, viewport.height, 0]}
      wrap='wrap'
    >
      <Box grow={1} shrink={1} basis={100} marginLeft={1}>
        <BigPainting />
      </Box>
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
            The Scream
          </Texts>
        </Box>
        <Box>
          <Texts
            italic
            lineHeight={1}
            letterSpacing={-0.05}
            color='#1f1f1f'
            maxWidth={(viewport.width / 6) * 3}
            fontSize={0.5}
          >
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Ullam
            facilis dignissimos sapiente eveniet! Adipisci voluptates eius quos
            rerum? In, repellat!
          </Texts>
        </Box>
      </Box>
    </Flex>
  );
};

export function donutPath(start:number,end:number){
  const point=(radius:number,angle:number)=>[130+radius*Math.cos(angle),130+radius*Math.sin(angle)].map(value=>value.toFixed(3)).join(',')
  if(end-start>=Math.PI*2-0.000001)return 'M130,22 A108,108 0 1 1 130,238 A108,108 0 1 1 130,22 M130,60 A70,70 0 1 0 130,200 A70,70 0 1 0 130,60 Z'
  const large=end-start>Math.PI?1:0
  return `M${point(108,start)} A108,108 0 ${large} 1 ${point(108,end)} L${point(70,end)} A70,70 0 ${large} 0 ${point(70,start)} Z`
}
